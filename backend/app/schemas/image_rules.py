import uuid

from pydantic import BaseModel, Field


class ImageRuleResult(BaseModel):
    rule: str
    passed: bool
    evidence: str = ""


class ImageRuleValidationResponse(BaseModel):
    status: str
    thread_id: uuid.UUID
    extracted_data: dict[str, object] = Field(default_factory=dict)
    results: list[ImageRuleResult] = Field(default_factory=list)
    image_name: str
