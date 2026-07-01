export const MEMORY_TYPES = Object.freeze({
  PERSON: 'PERSON',
  PROJECT: 'PROJECT',
  BUSINESS: 'BUSINESS',
  PREFERENCE: 'PREFERENCE',
  OBJECTIVE: 'OBJECTIVE',
  FACT: 'FACT',
  TASK: 'TASK',
  LOCATION: 'LOCATION',
  LANGUAGE: 'LANGUAGE',
  RELATION: 'RELATION',
  CONTACT: 'CONTACT',
  CUSTOM: 'CUSTOM'
});

export const MEMORY_TYPE_VALUES = Object.freeze(Object.values(MEMORY_TYPES));

export function isMemoryType(value) {
  return MEMORY_TYPE_VALUES.includes(value);
}
