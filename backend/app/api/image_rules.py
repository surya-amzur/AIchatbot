import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.image_rules import validator
from app.core.dependencies import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.image_rules import ImageRuleResult, ImageRuleValidationResponse


router = APIRouter(prefix="/api/image-rules", tags=["image-rules"])


@router.post("/validate", response_model=ImageRuleValidationResponse)
async def validate_image_rules(
    file: UploadFile = File(...),
    rules_text: str = Form(...),
    thread_id: uuid.UUID | None = Form(default=None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageRuleValidationResponse:
    image_name = file.filename or "image"
    content_type = file.content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail={"error": "invalid_file_type", "message": "Only image files are supported."},
        )

    image_bytes = await file.read()
    await file.close()

    try:
        out_thread_id, extracted_data, results = await validator.validate_image_against_rules(
            db=db,
            current_user=current_user,
            image_bytes=image_bytes,
            image_mime=content_type,
            image_name=image_name,
            rules_text=rules_text,
            thread_id=thread_id,
        )
    except validator.ImageRuleValidationError as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": "image_rule_validation_failed", "message": str(exc)},
        ) from exc

    return ImageRuleValidationResponse(
        status="ok",
        thread_id=out_thread_id,
        extracted_data=extracted_data,
        results=[ImageRuleResult(**row) for row in results],
        image_name=image_name,
    )
