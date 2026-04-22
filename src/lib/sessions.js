export const SESSION_MODES = Object.freeze({ PAPER: 'paper', REAL: 'real' });
export const SESSION_STATUS = Object.freeze({ ACTIVE: 'active', STOPPED: 'stopped' });
export const GOAL_TYPES = Object.freeze({ PERCENT: 'percent', VALUE: 'value' });

/**
 * Valida os campos do formulário de metas da sessão.
 * @param {{ goal_type: string, goal_profit: string|number, goal_loss: string|number }} form
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateGoalForm({ goal_type, goal_profit, goal_loss } = {}) {
  const errors = {};

  if (!goal_type) {
    errors.goal_type = 'Tipo de meta é obrigatório.';
  }

  const profit = Number(goal_profit);
  const loss = Number(goal_loss);

  if (!goal_profit && goal_profit !== 0) {
    errors.goal_profit = 'Meta de ganho é obrigatória.';
  } else if (isNaN(profit) || profit <= 0) {
    errors.goal_profit = 'Meta de ganho deve ser maior que zero.';
  } else if (goal_type === GOAL_TYPES.PERCENT && profit > 100) {
    errors.goal_profit = 'Meta de ganho não pode exceder 100%.';
  } else if (goal_type === GOAL_TYPES.PERCENT && profit < 0.1) {
    errors.goal_profit = 'Meta de ganho mínima é 0.1%.';
  } else if (goal_type === GOAL_TYPES.VALUE && profit < 1) {
    errors.goal_profit = 'Meta de ganho mínima é R$ 1.';
  }

  if (!goal_loss && goal_loss !== 0) {
    errors.goal_loss = 'Limite de perda é obrigatório.';
  } else if (isNaN(loss) || loss <= 0) {
    errors.goal_loss = 'Limite de perda deve ser maior que zero.';
  } else if (goal_type === GOAL_TYPES.PERCENT && loss > 100) {
    errors.goal_loss = 'Limite de perda não pode exceder 100%.';
  } else if (goal_type === GOAL_TYPES.PERCENT && loss < 0.1) {
    errors.goal_loss = 'Limite de perda mínima é 0.1%.';
  } else if (goal_type === GOAL_TYPES.VALUE && loss < 1) {
    errors.goal_loss = 'Limite de perda mínima é R$ 1.';
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
