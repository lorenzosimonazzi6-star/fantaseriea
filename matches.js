// ============================================================
// FANTA SERIE A 2025/26 — matches.js
// Configurazione partite con eventId Sofascore e kickoff UTC
//
// COME TROVARE L'eventId:
//   Vai su sofascore.com → cerca la partita → l'ID è nell'URL
//   es: sofascore.com/it/football/partita/inter-milan/XXXXXXXX
//
// ORARI: tutti in UTC (Italia = UTC+2 in estate, UTC+1 in inverno)
//   ore 12.30 CEST = 10:30 UTC  |  ore 12.30 CET = 11:30 UTC
//   ore 15.00 CEST = 13:00 UTC  |  ore 15.00 CET = 14:00 UTC
//   ore 18.00 CEST = 16:00 UTC  |  ore 18.00 CET = 17:00 UTC
//   ore 20.45 CEST = 18:45 UTC  |  ore 20.45 CET = 19:45 UTC
//
// Giornate 1-33 : già giocate — eventId da inserire se si vuole
//                 reimportare i voti da Sofascore
// Giornate 34-35: orari ufficiali, eventId da inserire
// Giornate 36-38: date ancora da stabilire, lasciare vuoti
// ============================================================

const MATCHES = {

  // ── GIORNATA 1 — 24/08/2025 ──────────────────────────────
  "1": [
    { eventId: "", home: "Atalanta",   away: "Pisa",        kickoff: "2025-08-24T13:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Fiorentina",  kickoff: "2025-08-24T13:00:00Z" },
    { eventId: "", home: "Como",       away: "Lazio",       kickoff: "2025-08-24T13:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Lecce",       kickoff: "2025-08-24T13:00:00Z" },
    { eventId: "", home: "Inter",      away: "Torino",      kickoff: "2025-08-24T18:45:00Z" },
    { eventId: "", home: "Juventus",   away: "Parma",       kickoff: "2025-08-24T18:45:00Z" },
    { eventId: "", home: "Milan",      away: "Cremonese",   kickoff: "2025-08-24T18:45:00Z" },
    { eventId: "", home: "Roma",       away: "Bologna",     kickoff: "2025-08-24T18:45:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Napoli",      kickoff: "2025-08-24T18:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Verona",      kickoff: "2025-08-24T18:45:00Z" },
  ],

  // ── GIORNATA 2 — 31/08/2025 ──────────────────────────────
  "2": [
    { eventId: "", home: "Bologna",    away: "Como",        kickoff: "2025-08-31T13:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Sassuolo",    kickoff: "2025-08-31T13:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Juventus",    kickoff: "2025-08-31T13:00:00Z" },
    { eventId: "", home: "Inter",      away: "Udinese",     kickoff: "2025-08-31T13:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Verona",      kickoff: "2025-08-31T13:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Milan",       kickoff: "2025-08-31T18:45:00Z" },
    { eventId: "", home: "Napoli",     away: "Cagliari",    kickoff: "2025-08-31T18:45:00Z" },
    { eventId: "", home: "Parma",      away: "Atalanta",    kickoff: "2025-08-31T18:45:00Z" },
    { eventId: "", home: "Pisa",       away: "Roma",        kickoff: "2025-08-31T18:45:00Z" },
    { eventId: "", home: "Torino",     away: "Fiorentina",  kickoff: "2025-08-31T18:45:00Z" },
  ],

  // ── GIORNATA 3 — 14/09/2025 ──────────────────────────────
  "3": [
    { eventId: "", home: "Atalanta",   away: "Lecce",       kickoff: "2025-09-14T13:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Parma",       kickoff: "2025-09-14T13:00:00Z" },
    { eventId: "", home: "Como",       away: "Genoa",       kickoff: "2025-09-14T13:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Napoli",      kickoff: "2025-09-14T13:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Inter",       kickoff: "2025-09-14T18:45:00Z" },
    { eventId: "", home: "Milan",      away: "Bologna",     kickoff: "2025-09-14T18:45:00Z" },
    { eventId: "", home: "Pisa",       away: "Udinese",     kickoff: "2025-09-14T18:45:00Z" },
    { eventId: "", home: "Roma",       away: "Torino",      kickoff: "2025-09-14T18:45:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Lazio",       kickoff: "2025-09-14T18:45:00Z" },
    { eventId: "", home: "Verona",     away: "Cremonese",   kickoff: "2025-09-14T18:45:00Z" },
  ],

  // ── GIORNATA 4 — 21/09/2025 ──────────────────────────────
  "4": [
    { eventId: "", home: "Bologna",    away: "Genoa",       kickoff: "2025-09-21T13:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Parma",       kickoff: "2025-09-21T13:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Como",        kickoff: "2025-09-21T13:00:00Z" },
    { eventId: "", home: "Inter",      away: "Sassuolo",    kickoff: "2025-09-21T13:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Roma",        kickoff: "2025-09-21T18:45:00Z" },
    { eventId: "", home: "Lecce",      away: "Cagliari",    kickoff: "2025-09-21T18:45:00Z" },
    { eventId: "", home: "Napoli",     away: "Pisa",        kickoff: "2025-09-21T18:45:00Z" },
    { eventId: "", home: "Torino",     away: "Atalanta",    kickoff: "2025-09-21T18:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Milan",       kickoff: "2025-09-21T18:45:00Z" },
    { eventId: "", home: "Verona",     away: "Juventus",    kickoff: "2025-09-21T18:45:00Z" },
  ],

  // ── GIORNATA 5 — 28/09/2025 ──────────────────────────────
  "5": [
    { eventId: "", home: "Cagliari",   away: "Inter",       kickoff: "2025-09-28T13:00:00Z" },
    { eventId: "", home: "Como",       away: "Cremonese",   kickoff: "2025-09-28T13:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Lazio",       kickoff: "2025-09-28T13:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Atalanta",    kickoff: "2025-09-28T13:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Bologna",     kickoff: "2025-09-28T13:00:00Z" },
    { eventId: "", home: "Milan",      away: "Napoli",      kickoff: "2025-09-28T18:45:00Z" },
    { eventId: "", home: "Parma",      away: "Torino",      kickoff: "2025-09-28T18:45:00Z" },
    { eventId: "", home: "Pisa",       away: "Fiorentina",  kickoff: "2025-09-28T18:45:00Z" },
    { eventId: "", home: "Roma",       away: "Verona",      kickoff: "2025-09-28T18:45:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Udinese",     kickoff: "2025-09-28T18:45:00Z" },
  ],

  // ── GIORNATA 6 — 05/10/2025 ──────────────────────────────
  "6": [
    { eventId: "", home: "Atalanta",   away: "Como",        kickoff: "2025-10-05T13:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Pisa",        kickoff: "2025-10-05T13:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Roma",        kickoff: "2025-10-05T13:00:00Z" },
    { eventId: "", home: "Inter",      away: "Cremonese",   kickoff: "2025-10-05T13:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Milan",       kickoff: "2025-10-05T18:45:00Z" },
    { eventId: "", home: "Lazio",      away: "Torino",      kickoff: "2025-10-05T18:45:00Z" },
    { eventId: "", home: "Napoli",     away: "Genoa",       kickoff: "2025-10-05T18:45:00Z" },
    { eventId: "", home: "Parma",      away: "Lecce",       kickoff: "2025-10-05T18:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Cagliari",    kickoff: "2025-10-05T18:45:00Z" },
    { eventId: "", home: "Verona",     away: "Sassuolo",    kickoff: "2025-10-05T18:45:00Z" },
  ],

  // ── GIORNATA 7 — 19/10/2025 ──────────────────────────────
  "7": [
    { eventId: "", home: "Atalanta",   away: "Lazio",       kickoff: "2025-10-19T13:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Bologna",     kickoff: "2025-10-19T13:00:00Z" },
    { eventId: "", home: "Como",       away: "Juventus",    kickoff: "2025-10-19T13:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Udinese",     kickoff: "2025-10-19T13:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Parma",       kickoff: "2025-10-19T13:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Sassuolo",    kickoff: "2025-10-19T18:45:00Z" },
    { eventId: "", home: "Milan",      away: "Fiorentina",  kickoff: "2025-10-19T18:45:00Z" },
    { eventId: "", home: "Pisa",       away: "Verona",      kickoff: "2025-10-19T18:45:00Z" },
    { eventId: "", home: "Roma",       away: "Inter",       kickoff: "2025-10-19T18:45:00Z" },
    { eventId: "", home: "Torino",     away: "Napoli",      kickoff: "2025-10-19T18:45:00Z" },
  ],

  // ── GIORNATA 8 — 26/10/2025 ──────────────────────────────
  "8": [
    { eventId: "", home: "Cremonese",  away: "Atalanta",    kickoff: "2025-10-26T13:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Bologna",     kickoff: "2025-10-26T13:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Juventus",    kickoff: "2025-10-26T13:00:00Z" },
    { eventId: "", home: "Milan",      away: "Pisa",        kickoff: "2025-10-26T13:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Inter",       kickoff: "2025-10-26T18:45:00Z" },
    { eventId: "", home: "Parma",      away: "Como",        kickoff: "2025-10-26T18:45:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Roma",        kickoff: "2025-10-26T18:45:00Z" },
    { eventId: "", home: "Torino",     away: "Genoa",       kickoff: "2025-10-26T18:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Lecce",       kickoff: "2025-10-26T18:45:00Z" },
    { eventId: "", home: "Verona",     away: "Cagliari",    kickoff: "2025-10-26T18:45:00Z" },
  ],

  // ── GIORNATA 9 — 29/10/2025 ──────────────────────────────
  "9": [
    { eventId: "", home: "Atalanta",   away: "Milan",       kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Bologna",    away: "Torino",      kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Cagliari",   away: "Sassuolo",    kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Como",       away: "Verona",      kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Genoa",      away: "Cremonese",   kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Inter",      away: "Fiorentina",  kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Juventus",   away: "Udinese",     kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Lecce",      away: "Napoli",      kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Pisa",       away: "Lazio",       kickoff: "2025-10-29T18:45:00Z" },
    { eventId: "", home: "Roma",       away: "Parma",       kickoff: "2025-10-29T18:45:00Z" },
  ],

  // ── GIORNATA 10 — 02/11/2025 ─────────────────────────────
  "10": [
    { eventId: "", home: "Cremonese",  away: "Juventus",    kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Lecce",       kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Cagliari",    kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Roma",        kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Como",        kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Parma",      away: "Bologna",     kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Genoa",       kickoff: "2025-11-02T14:00:00Z" },
    { eventId: "", home: "Torino",     away: "Pisa",        kickoff: "2025-11-02T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Atalanta",    kickoff: "2025-11-02T17:00:00Z" },
    { eventId: "", home: "Verona",     away: "Inter",       kickoff: "2025-11-02T19:45:00Z" },
  ],

  // ── GIORNATA 11 — 09/11/2025 ─────────────────────────────
  "11": [
    { eventId: "", home: "Atalanta",   away: "Sassuolo",    kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Napoli",      kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Cagliari",    kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Fiorentina",  kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Lazio",       kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Torino",      kickoff: "2025-11-09T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Verona",      kickoff: "2025-11-09T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Milan",       kickoff: "2025-11-09T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Cremonese",   kickoff: "2025-11-09T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Udinese",     kickoff: "2025-11-09T19:45:00Z" },
  ],

  // ── GIORNATA 12 — 23/11/2025 ─────────────────────────────
  "12": [
    { eventId: "", home: "Cagliari",   away: "Genoa",       kickoff: "2025-11-23T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Roma",        kickoff: "2025-11-23T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Juventus",    kickoff: "2025-11-23T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Milan",       kickoff: "2025-11-23T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Lecce",       kickoff: "2025-11-23T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Atalanta",    kickoff: "2025-11-23T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Pisa",        kickoff: "2025-11-23T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Como",        kickoff: "2025-11-23T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Bologna",     kickoff: "2025-11-23T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Parma",       kickoff: "2025-11-23T19:45:00Z" },
  ],

  // ── GIORNATA 13 — 30/11/2025 ─────────────────────────────
  "13": [
    { eventId: "", home: "Atalanta",   away: "Fiorentina",  kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Cremonese",   kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Sassuolo",    kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Verona",      kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Cagliari",    kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Torino",      kickoff: "2025-11-30T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Lazio",       kickoff: "2025-11-30T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Udinese",     kickoff: "2025-11-30T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Inter",       kickoff: "2025-11-30T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Napoli",      kickoff: "2025-11-30T19:45:00Z" },
  ],

  // ── GIORNATA 14 — 07/12/2025 ─────────────────────────────
  "14": [
    { eventId: "", home: "Cagliari",   away: "Roma",        kickoff: "2025-12-07T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Lecce",       kickoff: "2025-12-07T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Como",        kickoff: "2025-12-07T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Bologna",     kickoff: "2025-12-07T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Juventus",    kickoff: "2025-12-07T14:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Parma",       kickoff: "2025-12-07T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Fiorentina",  kickoff: "2025-12-07T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Milan",       kickoff: "2025-12-07T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Genoa",       kickoff: "2025-12-07T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Atalanta",    kickoff: "2025-12-07T19:45:00Z" },
  ],

  // ── GIORNATA 15 — 14/12/2025 ─────────────────────────────
  "15": [
    { eventId: "", home: "Atalanta",   away: "Cagliari",    kickoff: "2025-12-14T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Juventus",    kickoff: "2025-12-14T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Verona",      kickoff: "2025-12-14T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Inter",       kickoff: "2025-12-14T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Pisa",        kickoff: "2025-12-14T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Sassuolo",    kickoff: "2025-12-14T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Lazio",       kickoff: "2025-12-14T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Como",        kickoff: "2025-12-14T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Cremonese",   kickoff: "2025-12-14T19:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Napoli",      kickoff: "2025-12-14T19:45:00Z" },
  ],

  // ── GIORNATA 16 — 21/12/2025 ─────────────────────────────
  "16": [
    { eventId: "", home: "Cagliari",   away: "Pisa",        kickoff: "2025-12-21T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Milan",       kickoff: "2025-12-21T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Udinese",     kickoff: "2025-12-21T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Atalanta",    kickoff: "2025-12-21T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Lecce",       kickoff: "2025-12-21T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Roma",        kickoff: "2025-12-21T17:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Cremonese",   kickoff: "2025-12-21T17:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Parma",       kickoff: "2025-12-21T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Torino",      kickoff: "2025-12-21T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Bologna",     kickoff: "2025-12-21T19:45:00Z" },
  ],

  // ── GIORNATA 17 — 28/12/2025 ─────────────────────────────
  "17": [
    { eventId: "", home: "Atalanta",   away: "Inter",       kickoff: "2025-12-28T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Sassuolo",    kickoff: "2025-12-28T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Napoli",      kickoff: "2025-12-28T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Como",        kickoff: "2025-12-28T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Verona",      kickoff: "2025-12-28T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Fiorentina",  kickoff: "2025-12-28T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Juventus",    kickoff: "2025-12-28T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Genoa",       kickoff: "2025-12-28T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Cagliari",    kickoff: "2025-12-28T19:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Lazio",       kickoff: "2025-12-28T19:45:00Z" },
  ],

  // ── GIORNATA 18 — 03/01/2026 ─────────────────────────────
  "18": [
    { eventId: "", home: "Atalanta",   away: "Roma",        kickoff: "2026-01-03T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Milan",       kickoff: "2026-01-03T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Udinese",     kickoff: "2026-01-03T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Cremonese",   kickoff: "2026-01-03T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Pisa",        kickoff: "2026-01-03T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Bologna",     kickoff: "2026-01-03T17:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Lecce",       kickoff: "2026-01-03T17:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Napoli",      kickoff: "2026-01-03T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Parma",       kickoff: "2026-01-03T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Torino",      kickoff: "2026-01-03T19:45:00Z" },
  ],

  // ── GIORNATA 19 — 06/01/2026 ─────────────────────────────
  "19": [
    { eventId: "", home: "Bologna",    away: "Atalanta",    kickoff: "2026-01-06T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Cagliari",    kickoff: "2026-01-06T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Fiorentina",  kickoff: "2026-01-06T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Roma",        kickoff: "2026-01-06T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Genoa",       kickoff: "2026-01-06T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Verona",      kickoff: "2026-01-06T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Inter",       kickoff: "2026-01-06T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Como",        kickoff: "2026-01-06T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Juventus",    kickoff: "2026-01-06T19:45:00Z" },
    { eventId: "", home: "Torino",     away: "Udinese",     kickoff: "2026-01-06T19:45:00Z" },
  ],

  // ── GIORNATA 20 — 11/01/2026 ─────────────────────────────
  "20": [
    { eventId: "", home: "Atalanta",   away: "Torino",      kickoff: "2026-01-11T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Bologna",     kickoff: "2026-01-11T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Milan",       kickoff: "2026-01-11T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Cagliari",    kickoff: "2026-01-11T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Napoli",      kickoff: "2026-01-11T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Cremonese",   kickoff: "2026-01-11T17:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Parma",       kickoff: "2026-01-11T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Sassuolo",    kickoff: "2026-01-11T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Pisa",        kickoff: "2026-01-11T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Lazio",       kickoff: "2026-01-11T19:45:00Z" },
  ],

  // ── GIORNATA 21 — 18/01/2026 ─────────────────────────────
  "21": [
    { eventId: "", home: "Bologna",    away: "Fiorentina",  kickoff: "2026-01-18T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Juventus",    kickoff: "2026-01-18T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Verona",      kickoff: "2026-01-18T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Como",        kickoff: "2026-01-18T14:00:00Z" },
    { eventId: "", home: "Milan",      away: "Lecce",       kickoff: "2026-01-18T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Sassuolo",    kickoff: "2026-01-18T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Genoa",       kickoff: "2026-01-18T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Atalanta",    kickoff: "2026-01-18T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Roma",        kickoff: "2026-01-18T19:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Inter",       kickoff: "2026-01-18T19:45:00Z" },
  ],

  // ── GIORNATA 22 — 25/01/2026 ─────────────────────────────
  "22": [
    { eventId: "", home: "Atalanta",   away: "Parma",       kickoff: "2026-01-25T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Torino",      kickoff: "2026-01-25T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Cagliari",    kickoff: "2026-01-25T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Bologna",     kickoff: "2026-01-25T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Pisa",        kickoff: "2026-01-25T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Napoli",      kickoff: "2026-01-25T17:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Lazio",       kickoff: "2026-01-25T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Milan",       kickoff: "2026-01-25T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Cremonese",   kickoff: "2026-01-25T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Udinese",     kickoff: "2026-01-25T19:45:00Z" },
  ],

  // ── GIORNATA 23 — 01/02/2026 ─────────────────────────────
  "23": [
    { eventId: "", home: "Bologna",    away: "Milan",       kickoff: "2026-02-01T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Verona",      kickoff: "2026-02-01T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Atalanta",    kickoff: "2026-02-01T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Inter",       kickoff: "2026-02-01T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Genoa",       kickoff: "2026-02-01T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Fiorentina",  kickoff: "2026-02-01T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Juventus",    kickoff: "2026-02-01T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Sassuolo",    kickoff: "2026-02-01T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Lecce",       kickoff: "2026-02-01T19:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Roma",        kickoff: "2026-02-01T19:45:00Z" },
  ],

  // ── GIORNATA 24 — 08/02/2026 ─────────────────────────────
  "24": [
    { eventId: "", home: "Atalanta",   away: "Cremonese",   kickoff: "2026-02-08T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Parma",       kickoff: "2026-02-08T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Torino",      kickoff: "2026-02-08T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Napoli",      kickoff: "2026-02-08T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Lazio",       kickoff: "2026-02-08T14:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Udinese",     kickoff: "2026-02-08T17:00:00Z" },
    { eventId: "", home: "Milan",      away: "Como",        kickoff: "2026-02-08T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Cagliari",    kickoff: "2026-02-08T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Inter",       kickoff: "2026-02-08T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Pisa",        kickoff: "2026-02-08T19:45:00Z" },
  ],

  // ── GIORNATA 25 — 15/02/2026 ─────────────────────────────
  "25": [
    { eventId: "", home: "Cagliari",   away: "Lecce",       kickoff: "2026-02-15T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Fiorentina",  kickoff: "2026-02-15T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Genoa",       kickoff: "2026-02-15T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Juventus",    kickoff: "2026-02-15T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Atalanta",    kickoff: "2026-02-15T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Roma",        kickoff: "2026-02-15T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Verona",      kickoff: "2026-02-15T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Milan",       kickoff: "2026-02-15T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Bologna",     kickoff: "2026-02-15T19:45:00Z" },
    { eventId: "", home: "Udinese",    away: "Sassuolo",    kickoff: "2026-02-15T19:45:00Z" },
  ],

  // ── GIORNATA 26 — 22/02/2026 ─────────────────────────────
  "26": [
    { eventId: "", home: "Atalanta",   away: "Napoli",      kickoff: "2026-02-22T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Udinese",     kickoff: "2026-02-22T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Lazio",       kickoff: "2026-02-22T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Pisa",        kickoff: "2026-02-22T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Torino",      kickoff: "2026-02-22T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Como",        kickoff: "2026-02-22T17:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Inter",       kickoff: "2026-02-22T17:00:00Z" },
    { eventId: "", home: "Milan",      away: "Parma",       kickoff: "2026-02-22T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Cremonese",   kickoff: "2026-02-22T19:45:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Verona",      kickoff: "2026-02-22T19:45:00Z" },
  ],

  // ── GIORNATA 27 — 01/03/2026 ─────────────────────────────
  "27": [
    { eventId: "", home: "Como",       away: "Lecce",       kickoff: "2026-03-01T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Milan",       kickoff: "2026-03-01T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Genoa",       kickoff: "2026-03-01T14:00:00Z" },
    { eventId: "", home: "Parma",      away: "Cagliari",    kickoff: "2026-03-01T14:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Bologna",     kickoff: "2026-03-01T14:00:00Z" },
    { eventId: "", home: "Roma",       away: "Juventus",    kickoff: "2026-03-01T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Atalanta",    kickoff: "2026-03-01T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Lazio",       kickoff: "2026-03-01T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Fiorentina",  kickoff: "2026-03-01T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Napoli",      kickoff: "2026-03-01T19:45:00Z" },
  ],

  // ── GIORNATA 28 — 08/03/2026 ─────────────────────────────
  "28": [
    { eventId: "", home: "Atalanta",   away: "Udinese",     kickoff: "2026-03-08T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Verona",      kickoff: "2026-03-08T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Como",        kickoff: "2026-03-08T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Parma",       kickoff: "2026-03-08T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Roma",        kickoff: "2026-03-08T14:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Pisa",        kickoff: "2026-03-08T17:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Sassuolo",    kickoff: "2026-03-08T17:00:00Z" },
    { eventId: "", home: "Lecce",      away: "Cremonese",   kickoff: "2026-03-08T17:00:00Z" },
    { eventId: "", home: "Milan",      away: "Inter",       kickoff: "2026-03-08T19:45:00Z" },
    { eventId: "", home: "Napoli",     away: "Torino",      kickoff: "2026-03-08T19:45:00Z" },
  ],

  // ── GIORNATA 29 — 15/03/2026 ─────────────────────────────
  "29": [
    { eventId: "", home: "Como",       away: "Roma",        kickoff: "2026-03-15T14:00:00Z" },
    { eventId: "", home: "Cremonese",  away: "Fiorentina",  kickoff: "2026-03-15T14:00:00Z" },
    { eventId: "", home: "Inter",      away: "Atalanta",    kickoff: "2026-03-15T14:00:00Z" },
    { eventId: "", home: "Lazio",      away: "Milan",       kickoff: "2026-03-15T14:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Lecce",       kickoff: "2026-03-15T14:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Cagliari",    kickoff: "2026-03-15T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Bologna",     kickoff: "2026-03-15T17:00:00Z" },
    { eventId: "", home: "Torino",     away: "Parma",       kickoff: "2026-03-15T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Juventus",    kickoff: "2026-03-15T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Genoa",       kickoff: "2026-03-15T19:45:00Z" },
  ],

  // ── GIORNATA 30 — 22/03/2026 ─────────────────────────────
  "30": [
    { eventId: "", home: "Atalanta",   away: "Verona",      kickoff: "2026-03-22T14:00:00Z" },
    { eventId: "", home: "Bologna",    away: "Lazio",       kickoff: "2026-03-22T14:00:00Z" },
    { eventId: "", home: "Cagliari",   away: "Napoli",      kickoff: "2026-03-22T14:00:00Z" },
    { eventId: "", home: "Como",       away: "Pisa",        kickoff: "2026-03-22T14:00:00Z" },
    { eventId: "", home: "Fiorentina", away: "Inter",       kickoff: "2026-03-22T14:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Udinese",     kickoff: "2026-03-22T17:00:00Z" },
    { eventId: "", home: "Juventus",   away: "Sassuolo",    kickoff: "2026-03-22T17:00:00Z" },
    { eventId: "", home: "Milan",      away: "Torino",      kickoff: "2026-03-22T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Cremonese",   kickoff: "2026-03-22T19:45:00Z" },
    { eventId: "", home: "Roma",       away: "Lecce",       kickoff: "2026-03-22T19:45:00Z" },
  ],

  // ── GIORNATA 31 — 04/04/2026 ─────────────────────────────
  "31": [
    { eventId: "", home: "Cremonese",  away: "Bologna",     kickoff: "2026-04-04T13:30:00Z" },
    { eventId: "", home: "Inter",      away: "Roma",        kickoff: "2026-04-04T13:30:00Z" },
    { eventId: "", home: "Juventus",   away: "Genoa",       kickoff: "2026-04-04T13:30:00Z" },
    { eventId: "", home: "Lazio",      away: "Parma",       kickoff: "2026-04-04T13:30:00Z" },
    { eventId: "", home: "Lecce",      away: "Atalanta",    kickoff: "2026-04-04T17:00:00Z" },
    { eventId: "", home: "Napoli",     away: "Milan",       kickoff: "2026-04-04T17:00:00Z" },
    { eventId: "", home: "Pisa",       away: "Torino",      kickoff: "2026-04-04T17:00:00Z" },
    { eventId: "", home: "Sassuolo",   away: "Cagliari",    kickoff: "2026-04-04T17:00:00Z" },
    { eventId: "", home: "Udinese",    away: "Como",        kickoff: "2026-04-04T19:45:00Z" },
    { eventId: "", home: "Verona",     away: "Fiorentina",  kickoff: "2026-04-04T19:45:00Z" },
  ],

  // ── GIORNATA 32 — 12/04/2026 ─────────────────────────────
  "32": [
    { eventId: "", home: "Atalanta",   away: "Juventus",    kickoff: "2026-04-12T13:30:00Z" },
    { eventId: "", home: "Bologna",    away: "Lecce",       kickoff: "2026-04-12T13:30:00Z" },
    { eventId: "", home: "Cagliari",   away: "Cremonese",   kickoff: "2026-04-12T13:30:00Z" },
    { eventId: "", home: "Como",       away: "Inter",       kickoff: "2026-04-12T13:30:00Z" },
    { eventId: "", home: "Fiorentina", away: "Lazio",       kickoff: "2026-04-12T17:00:00Z" },
    { eventId: "", home: "Genoa",      away: "Sassuolo",    kickoff: "2026-04-12T17:00:00Z" },
    { eventId: "", home: "Milan",      away: "Udinese",     kickoff: "2026-04-12T17:00:00Z" },
    { eventId: "", home: "Parma",      away: "Napoli",      kickoff: "2026-04-12T17:00:00Z" },
    { eventId: "", home: "Roma",       away: "Pisa",        kickoff: "2026-04-12T19:45:00Z" },
    { eventId: "", home: "Torino",     away: "Verona",      kickoff: "2026-04-12T19:45:00Z" },
  ],

  // ── GIORNATA 33 — 18-19/04/2026 ─────────────────────────
  // Orari italiani (CEST) convertiti in UTC (-2h)
  "33": [
    { eventId: "13981743", home: "Cremonese",  away: "Torino",      kickoff: "2026-04-19T10:30:00Z" }, // dom 19/04 ore 12.30 CEST
    { eventId: "", home: "Inter",      away: "Cagliari",    kickoff: "2026-04-18T11:30:00Z" }, // sab 18/04 ore 13.30 CEST
    { eventId: "", home: "Juventus",   away: "Bologna",     kickoff: "2026-04-18T11:30:00Z" }, // sab 18/04 ore 13.30 CEST
    { eventId: "", home: "Lecce",      away: "Fiorentina",  kickoff: "2026-04-18T11:30:00Z" }, // sab 18/04 ore 13.30 CEST
    { eventId: "", home: "Napoli",     away: "Lazio",       kickoff: "2026-04-18T15:00:00Z" }, // sab 18/04 ore 17.00 CEST
    { eventId: "", home: "Pisa",       away: "Genoa",       kickoff: "2026-04-18T15:00:00Z" }, // sab 18/04 ore 17.00 CEST
    { eventId: "", home: "Roma",       away: "Atalanta",    kickoff: "2026-04-18T15:00:00Z" }, // sab 18/04 ore 17.00 CEST
    { eventId: "", home: "Sassuolo",   away: "Como",        kickoff: "2026-04-18T15:00:00Z" }, // sab 18/04 ore 17.00 CEST
    { eventId: "", home: "Udinese",    away: "Parma",       kickoff: "2026-04-18T17:45:00Z" }, // sab 18/04 ore 19.45 CEST
    { eventId: "", home: "Verona",     away: "Milan",       kickoff: "2026-04-18T17:45:00Z" }, // sab 18/04 ore 19.45 CEST
  ],

  // ── GIORNATA 34 — 24-27/04/2026 ──────────────────────────
  // Orari italiani (CEST) convertiti in UTC (-2h)
  "34": [
    { eventId: "13980105", home: "Napoli",     away: "Cremonese",   kickoff: "2026-04-24T16:45:00Z" }, // ven 24/04 ore 18.45 CEST
    { eventId: "13980107", home: "Parma",      away: "Pisa",        kickoff: "2026-04-25T11:00:00Z" }, // sab 25/04 ore 13.00 CEST
    { eventId: "13980113", home: "Bologna",    away: "Roma",        kickoff: "2026-04-25T14:00:00Z" }, // sab 25/04 ore 16.00 CEST
    { eventId: "13980114", home: "Verona",     away: "Lecce",       kickoff: "2026-04-25T16:45:00Z" }, // sab 25/04 ore 18.45 CEST
    { eventId: "13980110", home: "Fiorentina", away: "Sassuolo",    kickoff: "2026-04-26T08:30:00Z" }, // dom 26/04 ore 10.30 CEST
    { eventId: "13980109", home: "Genoa",      away: "Como",        kickoff: "2026-04-26T11:00:00Z" }, // dom 26/04 ore 13.00 CEST
    { eventId: "13980104", home: "Torino",     away: "Inter",       kickoff: "2026-04-26T14:00:00Z" }, // dom 26/04 ore 16.00 CEST
    { eventId: "13980106", home: "Milan",      away: "Juventus",    kickoff: "2026-04-26T16:45:00Z" }, // dom 26/04 ore 18.45 CEST
    { eventId: "13980111", home: "Cagliari",   away: "Atalanta",    kickoff: "2026-04-27T14:30:00Z" }, // lun 27/04 ore 16.30 CEST
    { eventId: "13980112", home: "Lazio",      away: "Udinese",     kickoff: "2026-04-27T16:45:00Z" }, // lun 27/04 ore 18.45 CEST
  ],

  // ── GIORNATA 35 — 01-04/05/2026 ──────────────────────────
  // Orari ufficiali. eventId da inserire quando disponibili su Sofascore.
  "35": [
    { eventId: "", home: "Pisa",       away: "Lecce",       kickoff: "2026-05-01T18:45:00Z" }, // ven 1/05 ore 20.45 CEST
    { eventId: "", home: "Udinese",    away: "Torino",      kickoff: "2026-05-02T13:00:00Z" }, // sab 2/05 ore 15.00 CEST
    { eventId: "", home: "Como",       away: "Napoli",      kickoff: "2026-05-02T16:00:00Z" }, // sab 2/05 ore 18.00 CEST
    { eventId: "", home: "Atalanta",   away: "Genoa",       kickoff: "2026-05-02T18:45:00Z" }, // sab 2/05 ore 20.45 CEST (SKY)
    { eventId: "", home: "Bologna",    away: "Cagliari",    kickoff: "2026-05-03T10:30:00Z" }, // dom 3/05 ore 12.30 CEST
    { eventId: "", home: "Sassuolo",   away: "Milan",       kickoff: "2026-05-03T13:00:00Z" }, // dom 3/05 ore 15.00 CEST
    { eventId: "", home: "Juventus",   away: "Verona",      kickoff: "2026-05-03T16:00:00Z" }, // dom 3/05 ore 18.00 CEST (SKY)
    { eventId: "", home: "Inter",      away: "Parma",       kickoff: "2026-05-03T18:45:00Z" }, // dom 3/05 ore 20.45 CEST
    { eventId: "", home: "Cremonese",  away: "Lazio",       kickoff: "2026-05-04T16:30:00Z" }, // lun 4/05 ore 18.30 CEST
    { eventId: "", home: "Roma",       away: "Fiorentina",  kickoff: "2026-05-04T18:45:00Z" }, // lun 4/05 ore 20.45 CEST (SKY)
  ],

  // ── GIORNATA 36 — data da stabilire ──────────────────────
  "36": [],

  // ── GIORNATA 37 — data da stabilire ──────────────────────
  "37": [],

  // ── GIORNATA 38 — data da stabilire ──────────────────────
  "38": [],
};

// Non modificare — usato da app.js per il polling live
const POLLING_INTERVAL_MS = 5 * 60 * 1000; // 5 minuti
