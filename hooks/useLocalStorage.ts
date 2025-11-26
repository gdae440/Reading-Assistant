import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  // Initialize state
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(error);
      return initialValue;
    }
  });

  // Use useEffect to update localStorage whenever the state changes.
  // This ensures the write operation is a proper side effect and doesn't conflict with React's render cycle.
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(storedValue));
    } catch (error) {
      console.error("Failed to write to local storage", error);
    }
  }, [key, storedValue]);

  return [storedValue, setStoredValue];
}