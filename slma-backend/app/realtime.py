from fastapi import APIRouter

router = APIRouter(prefix="/realtime", tags=["realtime"])


class ConnectionRegistry:
    def __init__(self) -> None:
        self.sessions: dict[str, set[str]] = {}

    def join(self, session_id: str, client_id: str) -> None:
        self.sessions.setdefault(session_id, set()).add(client_id)

    def leave(self, session_id: str, client_id: str) -> None:
        clients = self.sessions.get(session_id)
        if not clients:
            return
        clients.discard(client_id)
        if not clients:
            self.sessions.pop(session_id, None)


registry = ConnectionRegistry()