/**
 * Testes unitários — US-B2: validateGoalForm
 */
import { validateGoalForm, GOAL_TYPES } from '../../src/lib/sessions';

describe('validateGoalForm — testes unitários', () => {
  const validPercent = { goal_type: GOAL_TYPES.PERCENT, goal_profit: '2.5', goal_loss: '1.5' };
  const validValue = { goal_type: GOAL_TYPES.VALUE, goal_profit: '500', goal_loss: '200' };

  it('retorna válido para formulário percentual correto', () => {
    const result = validateGoalForm(validPercent);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('retorna válido para formulário por valor correto', () => {
    const result = validateGoalForm(validValue);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
  });

  it('retorna erro para goal_profit ausente', () => {
    const result = validateGoalForm({ ...validPercent, goal_profit: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toBeTruthy();
  });

  it('retorna erro para goal_loss ausente', () => {
    const result = validateGoalForm({ ...validPercent, goal_loss: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_loss).toBeTruthy();
  });

  it('retorna erro para goal_profit zero', () => {
    const result = validateGoalForm({ ...validPercent, goal_profit: '0' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toBeTruthy();
  });

  it('retorna erro para goal_profit negativo', () => {
    const result = validateGoalForm({ ...validPercent, goal_profit: '-1' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toBeTruthy();
  });

  it('retorna erro para goal_profit percentual > 100', () => {
    const result = validateGoalForm({ ...validPercent, goal_profit: '101' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toMatch(/100/);
  });

  it('retorna erro para goal_profit percentual < 0.1', () => {
    const result = validateGoalForm({ ...validPercent, goal_profit: '0.05' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toMatch(/0.1/);
  });

  it('retorna erro para goal_loss percentual > 100', () => {
    const result = validateGoalForm({ ...validPercent, goal_loss: '101' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_loss).toMatch(/100/);
  });

  it('retorna erro para goal_loss percentual < 0.1', () => {
    const result = validateGoalForm({ ...validPercent, goal_loss: '0.05' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_loss).toMatch(/0.1/);
  });

  it('retorna erro para goal_profit por valor < 1', () => {
    const result = validateGoalForm({ ...validValue, goal_profit: '0.5' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toBeTruthy();
  });

  it('retorna erro para goal_loss por valor < 1', () => {
    const result = validateGoalForm({ ...validValue, goal_loss: '0.5' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_loss).toBeTruthy();
  });

  it('retorna erro quando goal_type ausente', () => {
    const result = validateGoalForm({ goal_type: '', goal_profit: '2', goal_loss: '1' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_type).toBeTruthy();
  });

  it('retorna múltiplos erros simultaneamente', () => {
    const result = validateGoalForm({ goal_type: GOAL_TYPES.PERCENT, goal_profit: '', goal_loss: '' });
    expect(result.valid).toBe(false);
    expect(result.errors.goal_profit).toBeTruthy();
    expect(result.errors.goal_loss).toBeTruthy();
  });
});
