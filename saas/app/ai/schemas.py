"""Forme JSON chieste al modello. Porting di lessonStudyPackSchema e exerciseSetModelResponseSchema del desktop."""

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, model_validator

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class KeyPoint(BaseModel):
    title: str
    explanation: str


class OutlineTopic(BaseModel):
    topic: str
    subtopics: list[str]


class AiFlashcard(BaseModel):
    front: NonEmpty
    back: NonEmpty
    tags: list[str] = []
    difficulty: Literal["easy", "medium", "hard"]


class SelfCheckQuestion(BaseModel):
    question: str
    answer: str


class StudyPack(BaseModel):
    summary_markdown: str
    key_points: list[KeyPoint]
    study_outline: list[OutlineTopic]
    # Range 8-20 chiesto dal prompt; qui permissivi come il desktop: appunti scarni = meno flashcard.
    flashcards: list[AiFlashcard] = Field(min_length=1, max_length=30)
    self_check_questions: list[SelfCheckQuestion]


class MultipleChoice(BaseModel):
    type: Literal["multiple_choice"]
    id: NonEmpty
    question: NonEmpty
    options: list[NonEmpty] = Field(min_length=4, max_length=4)
    correctAnswer: NonEmpty
    explanation: NonEmpty
    difficulty: int = Field(ge=1, le=5)

    @model_validator(mode="after")
    def _check_options(self):
        if len(set(self.options)) != len(self.options):
            raise ValueError("Le opzioni non possono contenere duplicati")
        if self.correctAnswer not in self.options:
            raise ValueError("correctAnswer deve essere una delle opzioni disponibili")
        return self


class OpenAnswer(BaseModel):
    type: Literal["open_answer"]
    id: NonEmpty
    question: NonEmpty
    acceptedAnswers: list[NonEmpty] = Field(min_length=1)
    explanation: NonEmpty
    difficulty: int = Field(ge=1, le=5)


class ExerciseSet(BaseModel):
    title: NonEmpty
    # shortcut: niente coding_challenge (serve un editor di codice), da aggiungere con Monaco o simili.
    exercises: list[Annotated[MultipleChoice | OpenAnswer, Field(discriminator="type")]] = Field(min_length=3, max_length=8)

    @model_validator(mode="after")
    def _unique_ids(self):
        if len({e.id for e in self.exercises}) != len(self.exercises):
            raise ValueError("Ogni id di esercizio deve essere unico")
        return self


def normalize_answer(text: str) -> str:
    return " ".join(text.strip().lower().split())


def is_open_answer_correct(user_text: str, accepted: list[str]) -> bool:
    """Come isOpenAnswerCorrect del desktop: uguaglianza dopo normalizzazione, mai vera per una risposta vuota."""
    normalized = normalize_answer(user_text)
    return bool(normalized) and any(normalized == normalize_answer(a) for a in accepted)
