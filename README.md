# NOME.AI

Student API setup: [Student-Backend/README.md](./Student-Backend/README.md). Run `cd Student-Backend; npm install; npm run db:generate; npm run db:deploy; npm run dev`.

`Student-Backend/` is the deterministic student state API. The root `backend/` is the separately owned Agent/Prompt/Memory/RAG/model service; integration routes belong at the service boundary, not as placeholders in Student-Backend.
