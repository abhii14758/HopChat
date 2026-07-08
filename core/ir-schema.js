'use strict';

const VALID_ROLES = new Set(['user', 'assistant']);

function validateIR(ir) {
  const errors = [];

  if (!ir || typeof ir !== 'object') {
    return ['IR must be an object'];
  }

  const requiredStrings = ['sourcePlatform', 'sourceChatId', 'title', 'cwd'];
  for (const field of requiredStrings) {
    if (typeof ir[field] !== 'string' || ir[field].length === 0) {
      errors.push(`IR.${field} must be a non-empty string`);
    }
  }

  const requiredDates = ['createdAt', 'updatedAt'];
  for (const field of requiredDates) {
    if (typeof ir[field] !== 'string' || Number.isNaN(Date.parse(ir[field]))) {
      errors.push(`IR.${field} must be an ISO 8601 date string`);
    }
  }

  if (ir.gitBranch !== undefined && typeof ir.gitBranch !== 'string') {
    errors.push('IR.gitBranch must be a string when present');
  }
  if (ir.model !== undefined && typeof ir.model !== 'string') {
    errors.push('IR.model must be a string when present');
  }

  if (!Array.isArray(ir.turns) || ir.turns.length === 0) {
    errors.push('IR.turns must be a non-empty array');
    return errors;
  }

  ir.turns.forEach((turn, index) => {
    if (!turn || typeof turn !== 'object') {
      errors.push(`IR.turns[${index}] must be an object`);
      return;
    }
    if (!VALID_ROLES.has(turn.role)) {
      errors.push(`IR.turns[${index}].role must be "user" or "assistant"`);
    }
    if (typeof turn.text !== 'string') {
      errors.push(`IR.turns[${index}].text must be a string`);
    }
    if (turn.toolNarrations !== undefined) {
      const isStringArray =
        Array.isArray(turn.toolNarrations) && turn.toolNarrations.every((n) => typeof n === 'string');
      if (!isStringArray) {
        errors.push(`IR.turns[${index}].toolNarrations must be an array of strings when present`);
      }
      if (turn.role !== 'assistant') {
        errors.push(`IR.turns[${index}].toolNarrations is only valid on assistant turns`);
      }
    }
  });

  return errors;
}

function assertValidIR(ir) {
  const errors = validateIR(ir);
  if (errors.length > 0) {
    throw new Error(`Invalid IR:\n${errors.map((e) => `  - ${e}`).join('\n')}`);
  }
}

module.exports = { validateIR, assertValidIR };
