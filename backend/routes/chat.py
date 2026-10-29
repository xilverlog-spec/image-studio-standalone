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
from services.gemini_chat import gemini_chat_completion

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
    project: Optional[str] = None   # 프론트의 apiFetch 가 현재 프로젝트를 자동으로 실어 보낸다
    paid: bool = False              # True 면 유료 '정밀 읽기'(결제 연결된 Gemini 키 + 읽기용 모델). model 은 무시한다


@router.get("/paid/vision-status")
async def paid_vision_status():
    """유료 정밀 읽기 사용 가능 여부(키는 노출하지 않는다)."""
    from services import paid_vision
    return paid_vision.status()


@router.post("/chat/completions")
def chat_completions(request: ChatCompletionRequest):
    # async 가 아닌 일반 함수로 둔다(FastAPI 가 스레드에서 실행): 아래 구글·Ollama 호출은 길면 1~2분 걸리는 동기 호출이라,
    # async 로 두면 그동안 서버 전체(이미지 생성 요청·상태 확인)가 멈추고 감시 프로그램이 서버를 껐다 켠다(2026-10-29 사고).
    if request.paid:
        if request.project:
            from services import project_store
            if not project_store.get_external_allowed(request.project):
                raise HTTPException(status_code=403, detail="이 프로젝트는 외부 서버 전송이 금지되어 있어 유료 정밀 읽기(구글 서버)를 쓸 수 없습니다.")
        from services import paid_vision
        if not paid_vision.status()["available"]:
            raise HTTPException(status_code=400, detail="유료 정밀 읽기가 설정되어 있지 않습니다.")
        try:
            content = paid_vision.chat([m.model_dump(exclude_none=True) for m in request.messages], request.max_tokens, request.temperature)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"유료 정밀 읽기 실패: {e}")
        return {"id": "chatcmpl-paid", "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}]}
    if request.model.lower().startswith("gemini") and request.project:
        from services import project_store
        if not project_store.get_external_allowed(request.project):
            raise HTTPException(status_code=403, detail="이 프로젝트는 외부 서버 전송이 금지되어 있어 Gemini(구글 서버)를 쓸 수 없습니다. 프로젝트 비밀번호로 설정을 바꾸거나 다른 프로젝트에서 작업하세요.")
    # "gemini"로 시작하는 모델명은 로컬 Ollama 대신 Gemini API(무료 등급, 텍스트/비전 전용)로
    # 라우팅한다 — § config.py GEMINI_API_KEY 주석 참고. 호출부(프론트엔드)는 두 경우 모두
    # 같은 /v1/chat/completions 모양을 그대로 쓴다.
    is_gemini = request.model.lower().startswith("gemini")
    try:
        messages = [m.model_dump(exclude_none=True) for m in request.messages]
        if is_gemini:
            content = gemini_chat_completion(
                model=request.model,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )
        else:
            content = chat_completion(
                model=request.model,
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{'Gemini' if is_gemini else 'LLM'} 요청 실패: {e}")

    return {
        "id": "chatcmpl-standalone",
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}}],
    }
