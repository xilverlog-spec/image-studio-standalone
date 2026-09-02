# Standalone ComfyUI port of Fooocus's GPT-2 "Prompt Expansion" (a.k.a. "Fooocus V2").
# Source: extras/expansion.py
#
# Original license note carried over from Fooocus:
#   Algorithm created by Lvmin Zhang at 2023, Stanford.
#   If used inside Fooocus, any use is permitted.
#   If used outside Fooocus, only non-commercial use is permitted (CC-By NC 4.0).
#   This applies to the word list, vocab, model, and algorithm.
#
# Model files needed (copy or point at them in-place, no need to duplicate on disk):
#   <Fooocus>/models/prompt_expansion/fooocus_expansion/  (tokenizer files + positive.txt + model weights)
import os
import math

import torch
from transformers.generation.logits_process import LogitsProcessorList
from transformers import AutoTokenizer, AutoModelForCausalLM, set_seed

import comfy.model_management as model_management

SEED_LIMIT_NUMPY = 2 ** 32
neg_inf = -8192.0


def safe_str(x):
    x = str(x)
    for _ in range(16):
        x = x.replace('  ', ' ')
    return x.strip(",. \r\n")


class FooocusExpansion:
    def __init__(self, model_dir: str):
        """model_dir: path to Fooocus's models/prompt_expansion/fooocus_expansion folder."""
        if not os.path.isdir(model_dir):
            raise FileNotFoundError(f'Fooocus expansion model dir not found: {model_dir}')

        self.tokenizer = AutoTokenizer.from_pretrained(model_dir)

        positive_words = open(os.path.join(model_dir, 'positive.txt'),
                               encoding='utf-8').read().splitlines()
        positive_words = ['Ġ' + x.lower() for x in positive_words if x != '']

        self.logits_bias = torch.zeros((1, len(self.tokenizer.vocab)), dtype=torch.float32) + neg_inf

        found = 0
        for k, v in self.tokenizer.vocab.items():
            if k in positive_words:
                self.logits_bias[0, v] = 0
                found += 1
        print(f'[Fooocus Port] Prompt Expansion: vocab with {found} words.')

        self.model = AutoModelForCausalLM.from_pretrained(model_dir)
        self.model.eval()

        load_device = model_management.text_encoder_device()
        offload_device = model_management.text_encoder_offload_device()

        if model_management.is_device_mps(load_device):
            load_device = torch.device('cpu')
            offload_device = torch.device('cpu')

        use_fp16 = model_management.should_use_fp16(device=load_device)
        if use_fp16:
            self.model.half()

        # 2026-09-02: 원래는 comfy.model_patcher.ModelPatcher로 감싸서 ComfyUI의 자동 VRAM
        # 오프로딩을 태웠는데, 최신 ComfyUI 코어의 unpatch_model()이 self.model.device = ...로
        # 직접 대입을 시도한다 — HuggingFace의 GPT2LMHeadModel은 device가 읽기전용 프로퍼티라
        # AttributeError가 난다. GPT2 모델 자체가 작아서(수백MB) VRAM 관리 이점이 크지 않으므로,
        # ModelPatcher 없이 그냥 직접 디바이스로 옮겨서 고정해두는 방식으로 우회한다.
        self.load_device = load_device
        self.offload_device = offload_device
        self.model.to(self.load_device)
        print(f'[Fooocus Port] Prompt Expansion engine loaded for {load_device}, use_fp16 = {use_fp16}.')

    @torch.no_grad()
    @torch.inference_mode()
    def logits_processor(self, input_ids, scores):
        assert scores.ndim == 2 and scores.shape[0] == 1
        self.logits_bias = self.logits_bias.to(scores)

        bias = self.logits_bias.clone()
        bias[0, input_ids[0].to(bias.device).long()] = neg_inf
        bias[0, 11] = 0  # always allow comma
        return scores + bias

    @torch.no_grad()
    @torch.inference_mode()
    def __call__(self, prompt: str, seed: int) -> str:
        if prompt == '':
            return ''

        seed = int(seed) % SEED_LIMIT_NUMPY
        set_seed(seed)
        prompt = safe_str(prompt) + ','

        tokenized = self.tokenizer(prompt, return_tensors="pt")
        tokenized.data['input_ids'] = tokenized.data['input_ids'].to(self.load_device)
        tokenized.data['attention_mask'] = tokenized.data['attention_mask'].to(self.load_device)

        current_token_length = int(tokenized.data['input_ids'].shape[1])
        max_token_length = 75 * int(math.ceil(float(current_token_length) / 75.0))
        max_new_tokens = max_token_length - current_token_length

        if max_new_tokens == 0:
            return prompt[:-1]

        features = self.model.generate(**tokenized,
                                        top_k=100,
                                        max_new_tokens=max_new_tokens,
                                        do_sample=True,
                                        logits_processor=LogitsProcessorList([self.logits_processor]))

        response = self.tokenizer.batch_decode(features, skip_special_tokens=True)
        return safe_str(response[0])
