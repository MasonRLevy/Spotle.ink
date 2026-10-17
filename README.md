# Spotle.online
SwampHacks 2026!!!

## Local development

### Frontend

cd frontend
npm install
npm run dev

### Backend

cd backend
npm install
npm run dev

The frontend expects the backend on http://localhost:3001.
If you want to enable real Gemini validation, copy backend/.env.example to backend/.env and add your GEMINI_API_KEY.

When developing in Python, activate the virtual environment as needed:
- Windows: .venv\Scripts\activate
- macOS/Linux: source .venv/bin/activate