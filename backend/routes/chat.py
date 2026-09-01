"""대화형 탭(디자이너 페르소나 채팅) 및 대화→프롬프트 컴파일이 사용하는
OpenAI 스타일 /v1/chat/completions 엔드포인트.

DX 랩 본체의 동일 엔드포인트(agent_router/routes/chat.py)는 멀티 에이전트 툴 루프까지
돌리지만, 이미지 스튜디오 단독 패키지에서는 "대화 → 최종 프롬프트 정리"에만 쓰이므로
Ollama에 곧장 물어보는 얇은 래퍼로 충분하다.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.simple_chat import chat_completion

router = APIRouter(prefix="/v1")


class ChatMessage(BaseModel):
    role: str
    content: str
    # base64 인코딩된 이미지(데이터 URL 접두사 없이). vision 지원 모델(gemma4 등)에만 의미가 있다 —
    # 대화 탭에서 참고 이미지를 첨부하면 여기 담겨서 Ollama에 그대로 전달된다.
    images: Optional[List[str]] = None


class ChatCompletionRequest(BaseModel):
    model: str = "gemma4:e4b"
    agent_id: Optional[str] = None
    messages: List[ChatMessage]
    max_tokens: int = 3000
    temperature: float = 0.3


@router.post("/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    try:
        content = chat_completion(
            model=request.model,
            messages=[m.model_dump(exclude_none=True) for m in request.messages],
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 요청 실패: {e}")

    return {
        "id": "chatcmpl-standalone",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
    }
