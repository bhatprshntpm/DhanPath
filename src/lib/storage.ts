import type { AppData, Settings } from '../types'
import { DEMO_FLAG, DEMO_DATA } from './demoData'

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME    = 'dhanpath-db'
const DB_VERSION = 1
const STORE      = 'app-data'
const DATA_KEY   = 'main'
const META_KEY   = 'meta'
const LS_OLD_KEY = 'finance-os-data'   // legacy localStorage key for migration

export const BACKUP_INTERVAL_DAYS = 7

// ─── Default data ─────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  name:                'My Finances',
  currentAge:          28,
  retirementAge:       55,
  lifeExpectancy:      85,
  annualReturn:        12,
  equityReturn:        14,
  debtReturn:          7,
  equityAllocation:    70,
  sipStepUp:           10,
  incomeGrowthRate:    8,
  inflationRate:       6,
  safeWithdrawalRate:  4,
  monthlyExpenses:     60000,
  monthlyIncome:       0,
  existingSIP:         0,
  monthlyEMI:          0,
  lifestyleMultiplier: 1.0,
  currency:            'INR',
}

export const DEFAULT_DATA: AppData = {
  snapshots:    [],
  transactions: [],
  holdings:     [],
  debts:        [],
  goals:        [],
  scenarios: [{
    id: 'baseline', name: 'Baseline', color: '#f59e0b', enabled: true,
    assumptions: {
      monthlyIncome: 100000, monthlyExpenses: 60000, annualReturn: 12,
      equityReturn: 14, debtReturn: 7, equityAllocation: 70,
      extraMonthlySavings: 10000, sipStepUp: 10, incomeGrowthRate: 8,
      inflationRate: 6, lifestyleMultiplier: 1.0,
    },
  }],
  settings: DEFAULT_SETTINGS,
}

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror   = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = e => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
  })
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as T)
    req.onerror   = () => reject(req.error)
  })
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    req.onsuccess = () => resolve()
    req.onerror   = () => reject(req.error)
  })
}

// ─── Migration from localStorage ─────────────────────────────────────────────

async function migrateIfNeeded(): Promise<void> {
  const existing = await idbGet(DATA_KEY)
  if (existing) return                         // already migrated

  const old = localStorage.getItem(LS_OLD_KEY)
  if (!old) return                             // nothing to migrate

  try {
    const parsed = JSON.parse(old)
    await idbSet(DATA_KEY, parsed)
    localStorage.removeItem(LS_OLD_KEY)
    console.info('[DhanPath] Migrated data from localStorage → IndexedDB')
  } catch {
    console.warn('[DhanPath] Migration failed — starting fresh')
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function loadData(): Promise<AppData> {
  if (localStorage.getItem(DEMO_FLAG) === '1') return DEMO_DATA

  await migrateIfNeeded()

  try {
    const raw = await idbGet<Partial<AppData>>(DATA_KEY)
    if (!raw) return DEFAULT_DATA
    return {
      snapshots:    raw.snapshots    ?? [],
      transactions: raw.transactions ?? [],
      holdings:     raw.holdings     ?? [],
      debts:        raw.debts        ?? [],
      goals:        raw.goals        ?? [],
      scenarios:    raw.scenarios    ?? DEFAULT_DATA.scenarios,
      settings:     { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
    }
  } catch {
    return DEFAULT_DATA
  }
}

export async function saveData(data: AppData): Promise<void> {
  if (localStorage.getItem(DEMO_FLAG) === '1') {
    localStorage.removeItem(DEMO_FLAG)
  }
  await idbSet(DATA_KEY, data)
}

// ─── Backup metadata ──────────────────────────────────────────────────────────

interface BackupMeta {
  lastBackupDate: string   // ISO date YYYY-MM-DD
  neverRemind:    boolean
  remindAfter:    string   // ISO date — snooze until this date
}

export async function getBackupMeta(): Promise<BackupMeta> {
  const meta = await idbGet<BackupMeta>(META_KEY)
  return meta ?? { lastBackupDate: '', neverRemind: false, remindAfter: '' }
}

export async function setBackupMeta(patch: Partial<BackupMeta>): Promise<void> {
  const current = await getBackupMeta()
  await idbSet(META_KEY, { ...current, ...patch })
}

export function shouldShowBackupReminder(meta: BackupMeta): boolean {
  if (meta.neverRemind) return false
  const today = new Date().toISOString().slice(0, 10)
  if (meta.remindAfter && today < meta.remindAfter) return false
  if (!meta.lastBackupDate) return true
  const daysSince = (Date.now() - new Date(meta.lastBackupDate).getTime()) / 86400000
  return daysSince >= BACKUP_INTERVAL_DAYS
}

// ─── Export (plain JSON) ──────────────────────────────────────────────────────

export function exportData(data: AppData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `dhanpath-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Export (AES-256-GCM encrypted) ──────────────────────────────────────────

export async function exportEncrypted(data: AppData, passphrase: string): Promise<void> {
  const json    = JSON.stringify(data)
  const encoded = new TextEncoder().encode(json)
  const salt    = crypto.getRandomValues(new Uint8Array(16))
  const iv      = crypto.getRandomValues(new Uint8Array(12))

  const keyMat = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    keyMat, { name: 'AES-GCM', length: 256 }, false, ['encrypt'],
  )
  const cipher  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded)

  // Format: [4 bytes magic] [16 bytes salt] [12 bytes iv] [cipher...]
  const magic  = new Uint8Array([0x44, 0x50, 0x41, 0x54])   // DPAT
  const result = new Uint8Array(4 + 16 + 12 + cipher.byteLength)
  result.set(magic,                    0)
  result.set(salt,                     4)
  result.set(iv,                       20)
  result.set(new Uint8Array(cipher),   32)

  const blob = new Blob([result], { type: 'application/octet-stream' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `dhanpath-backup-${new Date().toISOString().slice(0, 10)}.dpat`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Import (auto-detects JSON or encrypted .dpat) ───────────────────────────

export async function importData(file: File, passphrase?: string): Promise<AppData> {
  const buffer = await file.arrayBuffer()
  const bytes  = new Uint8Array(buffer)

  // Check magic header for encrypted file
  const isEncrypted = bytes[0] === 0x44 && bytes[1] === 0x50 && bytes[2] === 0x41 && bytes[3] === 0x54

  if (isEncrypted) {
    if (!passphrase) throw new Error('PASSPHRASE_REQUIRED')

    const salt   = bytes.slice(4, 20)
    const iv     = bytes.slice(20, 32)
    const cipher = bytes.slice(32)

    const keyMat = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'],
    )
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
    )
    try {
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher)
      return JSON.parse(new TextDecoder().decode(plain)) as AppData
    } catch {
      throw new Error('WRONG_PASSPHRASE')
    }
  }

  // Plain JSON
  const text = new TextDecoder().decode(buffer)
  try {
    return JSON.parse(text) as AppData
  } catch {
    throw new Error('Invalid backup file')
  }
}
