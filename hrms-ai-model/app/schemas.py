from typing import Any, Optional

from pydantic import BaseModel, Field


class UserContext(BaseModel):
    role: str = "employee"
    name: str = "User"
    employeeId: Optional[str] = None
    department: Optional[Any] = None
    division: Optional[Any] = None


class CatalogEntry(BaseModel):
    id: str
    method: str = "GET"
    path: str = ""
    description: str = ""
    roles: list[str] = Field(default_factory=list)
    queryParams: list[str] = Field(default_factory=list)
    pathParams: list[str] = Field(default_factory=list)


class HistoryMessage(BaseModel):
    role: str
    content: str


class PlannedEndpoint(BaseModel):
    endpointId: str
    pathParams: dict[str, str] = Field(default_factory=dict)
    query: dict[str, str] = Field(default_factory=dict)
    reason: str = ""


class RouterRequest(BaseModel):
    message: str
    userContext: UserContext
    catalog: list[CatalogEntry] = Field(default_factory=list)
    history: list[HistoryMessage] = Field(default_factory=list)


class RouterResponse(BaseModel):
    endpoints: list[PlannedEndpoint] = Field(default_factory=list)
    needsClarification: Optional[str] = None
    reasoning: str = "hrms-python-router"


class FetchedRow(BaseModel):
    endpointId: Optional[str] = None
    ok: bool = False
    data: Optional[Any] = None
    query: dict[str, str] = Field(default_factory=dict)
    status: Optional[int] = None
    error: Optional[str] = None
    truncated: Optional[bool] = None


class AnswerRequest(BaseModel):
    message: str
    userContext: UserContext
    fetchedData: list[FetchedRow] = Field(default_factory=list)
    needsClarification: Optional[str] = None
    history: list[HistoryMessage] = Field(default_factory=list)


class AnswerResponse(BaseModel):
    reply: str
    answerEngine: str = "hrms-native"
