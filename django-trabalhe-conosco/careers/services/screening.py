from django.conf import settings


def score_application(job, application, resume_text: str) -> float:
    """Return a free, auditable score; Agno can raise it when explicitly enabled."""
    base = 0.0
    haystack = f"{application.message}\n{resume_text}".lower()
    for term in _terms(job.requirements):
        if term.lower() in haystack:
            base += 1
    score = min(100.0, base * 20)

    if settings.AGNO_ENABLED:
        try:
            from agno.agent import Agent

            agent = Agent(markdown=False)
            response = agent.run(
                f"Retorne apenas uma nota de 0 a 100 para aderencia da candidatura ao cargo {job.title}. "
                f"Requisitos: {job.requirements}. Curriculo: {resume_text[:3000]}"
            )
            maybe_score = float(str(response.content).strip().split()[0].replace(",", "."))
            score = max(score, min(100.0, maybe_score))
        except Exception:
            pass

    return round(score, 2)


def _terms(text: str) -> list[str]:
    return [line.strip(" -*\t") for line in text.splitlines() if len(line.strip()) > 2][:5]
