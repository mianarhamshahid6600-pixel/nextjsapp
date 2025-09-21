
// src/lib/localStorage-helpers.ts
export function loadFromLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') {
    return defaultValue;
  }
  try {
    const serializedState = localStorage.getItem(key);
    if (serializedState === null) {
      return defaultValue;
    }
    return JSON.parse(serializedState) as T;
  } catch (e) {
    console.warn(`Error loading ${key} from localStorage:`, e);
    return defaultValue;
  }
}

export function saveToLocalStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const serializedState = JSON.stringify(value);
    localStorage.setItem(key, serializedState);
  } catch (e) {
    console.warn(`Error saving ${key} to localStorage:`, e);
  }
}
