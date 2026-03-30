/**
 * useThingSpeakFieldSelector
 *
 * Encapsulates ALL logic for the ThingSpeak field-selector system:
 *  - Credential state (channelId, readApiKey)
 *  - Fetching available fields from the ThingSpeak API
 *  - Multi-row field selection with duplicate prevention
 *  - Reset semantics when credentials change
 *
 * The component layer only needs to render UI — zero business logic needed there.
 */

import { useState, useCallback, useRef } from 'react';
import axios, { AxiosError } from 'axios';

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_FIELD_KEYS = [
  'field1', 'field2', 'field3', 'field4',
  'field5', 'field6', 'field7', 'field8',
] as const;

type FieldKey = typeof ALL_FIELD_KEYS[number];

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single field entry returned by the hook. */
export interface ThingSpeakField {
  key: string;   // e.g. "field1"
  label: string; // e.g. "Temperature" (from channel metadata) or "Field 1"
}

/** Public API surface of the hook. */
export interface UseThingSpeakFieldSelectorReturn {
  // ── Credentials ──────────────────────────────────────────────────────────
  channelId: string;
  readApiKey: string;
  setChannelId: (value: string) => void;
  setReadApiKey: (value: string) => void;

  // ── Fetch state ──────────────────────────────────────────────────────────
  availableFields: ThingSpeakField[];
  isFetching: boolean;
  fetchError: string | null;
  hasFetched: boolean;

  // ── Row state ────────────────────────────────────────────────────────────
  /** Array of selected field keys, one per row. Empty string = no selection. */
  selectedFields: string[];

  // ── Actions ──────────────────────────────────────────────────────────────
  fetchFields: () => Promise<void>;
  selectField: (rowIndex: number, fieldKey: string) => void;
  addRow: () => void;
  removeRow: (rowIndex: number) => void;

  // ── Derived helpers ──────────────────────────────────────────────────────
  /**
   * For a given row index, returns the available fields with an `isDisabled`
   * flag set if that field is already selected in another row.
   */
  getOptionsForRow: (rowIndex: number) => Array<ThingSpeakField & { isDisabled: boolean }>;

  /** True when at least one row has a non-empty selection. */
  isValid: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface ThingSpeakFeed {
  field1?: string | null;
  field2?: string | null;
  field3?: string | null;
  field4?: string | null;
  field5?: string | null;
  field6?: string | null;
  field7?: string | null;
  field8?: string | null;
}

interface ThingSpeakChannel {
  field1?: string;
  field2?: string;
  field3?: string;
  field4?: string;
  field5?: string;
  field6?: string;
  field7?: string;
  field8?: string;
}

interface ThingSpeakApiResponse {
  channel: ThingSpeakChannel;
  feeds: ThingSpeakFeed[];
}

function deriveFields(data: ThingSpeakApiResponse): ThingSpeakField[] {
  return ALL_FIELD_KEYS
    .filter((key) =>
      // Include a field only if at least one feed entry has a non-null value for it.
      data.feeds.some((feed) => feed[key] != null && feed[key] !== '')
    )
    .map((key) => ({
      key,
      label: data.channel[key as FieldKey] || `Field ${key.replace('field', '')}`,
    }));
}

function parseError(err: unknown): string {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (status === 400 || status === 401) return 'Invalid API key or Channel ID.';
    if (status === 404) return 'Channel not found. Check the Channel ID.';
    if (status === 429) return 'Rate limit exceeded. Please wait and retry.';
    if (!err.response) return 'Network error. Check your internet connection.';
    return `API error ${status}: ${err.message}`;
  }
  return err instanceof Error ? err.message : 'Unknown error occurred.';
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useThingSpeakFieldSelector(): UseThingSpeakFieldSelectorReturn {
  const [channelId, setChannelIdRaw] = useState('');
  const [readApiKey, setReadApiKeyRaw] = useState('');
  const [availableFields, setAvailableFields] = useState<ThingSpeakField[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // One entry per row; empty string means "no selection yet".
  const [selectedFields, setSelectedFields] = useState<string[]>(['']);

  // Abort controller ref prevents race conditions on rapid re-fetches.
  const abortRef = useRef<AbortController | null>(null);

  // ── Credential setters ───────────────────────────────────────────────────
  // Changing either credential resets all derived state so stale data can
  // never be accidentally submitted.

  const setChannelId = useCallback((value: string) => {
    setChannelIdRaw(value);
    setAvailableFields([]);
    setSelectedFields(['']);
    setFetchError(null);
    setHasFetched(false);
  }, []);

  const setReadApiKey = useCallback((value: string) => {
    setReadApiKeyRaw(value);
    setAvailableFields([]);
    setSelectedFields(['']);
    setFetchError(null);
    setHasFetched(false);
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchFields = useCallback(async () => {
    const id = channelId.trim();
    const key = readApiKey.trim();

    if (!id || !key) {
      setFetchError('Channel ID and Read API Key are required.');
      return;
    }

    // Cancel any in-flight request.
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setIsFetching(true);
    setFetchError(null);
    setAvailableFields([]);
    setSelectedFields(['']); // Reset selections on every new fetch.
    setHasFetched(false);

    try {
      const { data } = await axios.get<ThingSpeakApiResponse>(
        `https://api.thingspeak.com/channels/${id}/feeds.json`,
        {
          params: { api_key: key, results: 1 },
          signal: abortRef.current.signal,
        }
      );

      const fields = deriveFields(data);
      setAvailableFields(fields);
      setHasFetched(true);

      if (fields.length === 0) {
        setFetchError('No active fields found in this channel.');
      }
    } catch (err) {
      if (axios.isCancel(err)) return; // Request was intentionally cancelled.
      setFetchError(parseError(err));
      setHasFetched(true);
    } finally {
      setIsFetching(false);
    }
  }, [channelId, readApiKey]);

  // ── Row management ───────────────────────────────────────────────────────

  const selectField = useCallback((rowIndex: number, fieldKey: string) => {
    setSelectedFields((prev) => {
      const next = [...prev];
      next[rowIndex] = fieldKey;
      return next;
    });
  }, []);

  const addRow = useCallback(() => {
    setSelectedFields((prev) => [...prev, '']);
  }, []);

  const removeRow = useCallback((rowIndex: number) => {
    setSelectedFields((prev) => {
      // Never remove if only one row exists — reset it to empty instead.
      if (prev.length === 1) return [''];
      return prev.filter((_, i) => i !== rowIndex);
    });
  }, []);

  // ── Derived helpers ──────────────────────────────────────────────────────

  const getOptionsForRow = useCallback(
    (rowIndex: number) => {
      const currentValue = selectedFields[rowIndex] ?? '';
      const otherSelections = new Set(
        selectedFields.filter((v, i) => i !== rowIndex && v !== '')
      );

      return availableFields.map((field) => ({
        ...field,
        isDisabled: otherSelections.has(field.key) && field.key !== currentValue,
      }));
    },
    [availableFields, selectedFields]
  );

  const isValid = selectedFields.some((f) => f !== '');

  // ── Public API ───────────────────────────────────────────────────────────

  return {
    channelId,
    readApiKey,
    setChannelId,
    setReadApiKey,

    availableFields,
    isFetching,
    fetchError,
    hasFetched,

    selectedFields,

    fetchFields,
    selectField,
    addRow,
    removeRow,
    getOptionsForRow,

    isValid,
  };
}
