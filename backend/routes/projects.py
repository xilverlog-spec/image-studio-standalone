from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services import project_store

router = APIRouter(prefix="/v1/projects", tags=["projects"])


class ProjectCreateRequest(BaseModel):
    name: str
    password: str


class ProjectLoginRequest(BaseModel):
    name: str
    password: str


class ProjectRenameRequest(BaseModel):
    name: str
    new_name: str
    password: str


class ProjectDeleteRequest(BaseModel):
    name: str
    password: str


class ExternalPolicyRequest(BaseModel):
    name: str
    password: str
    allowed: bool


@router.get("/external-policy")
async def external_policy(project: str = ""):
    """현재 프로젝트가 외부 서버 전송(유료 이미지 API)을 허용하는지."""
    return {"status": "success", "project": project, "external_allowed": project_store.get_external_allowed(project)}


@router.post("/external-policy")
async def set_external_policy(request: ExternalPolicyRequest):
    try:
        project_store.set_external_allowed(request.name, request.allowed, request.password)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e))
    return {"status": "success", "project": request.name, "external_allowed": request.allowed}


@router.get("")
async def list_projects():
    return {"status": "success", "projects": project_store.list_projects()}


@router.post("/create")
async def create_project(request: ProjectCreateRequest):
    name = request.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="프로젝트 이름을 입력해주세요.")
    if len(request.password) < 4:
        raise HTTPException(status_code=400, detail="비밀번호는 4자 이상이어야 합니다.")
    try:
        project_store.create_project(name, request.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "success", "name": name}


@router.post("/login")
async def login_project(request: ProjectLoginRequest):
    if not project_store.verify_project(request.name, request.password):
        raise HTTPException(status_code=401, detail="프로젝트 이름 또는 비밀번호가 올바르지 않습니다.")
    return {"status": "success", "name": request.name}


@router.post("/rename")
async def rename_project(request: ProjectRenameRequest):
    new_name = request.new_name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="새 이름을 입력해주세요.")
    try:
        project_store.rename_project(request.name, new_name, request.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "success", "name": new_name}


@router.post("/delete")
async def delete_project(request: ProjectDeleteRequest):
    try:
        project_store.delete_project(request.name, request.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"status": "success"}
