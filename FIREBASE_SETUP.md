# Firebase-opsætning til v11

v10 på `main` er fortsat den stabile version. Login-arbejdet ligger på `v11-login-admin`.

1. Opret et separat Firebase-projekt til Elpris.
2. Slå **Authentication > Email/Password** til.
3. Opret en **Firestore Database**.
4. Opret en Web App i Firebase og kopier konfigurationen til `firebase-config.js`.
5. Sæt `enabled: true` og din egen e-mail i `bootstrapAdminEmail`.
6. Udgiv reglerne fra `firestore.rules`.
7. Log ind første gang. Appen viser dit Firebase UID.
8. Opret manuelt dokumentet `admins/<DIT_UID>` i Firestore. Indholdet kan fx være `{ role: "admin" }`.
9. Genindlæs appen. Herefter får du knappen **Brugere**, og resten kan administreres fra appen.

Nye brugere:
- Du skriver personens e-mail under **Brugere**.
- Du trykker **Kopiér app-link** og sender selv linket.
- Personen åbner linket, skriver samme e-mail og vælger eget password første gang.
- Login huskes på enheden via Firebase browser-persistence.
