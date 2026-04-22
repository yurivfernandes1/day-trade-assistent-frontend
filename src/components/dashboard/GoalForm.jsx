import { useState } from 'react';
import { validateGoalForm, GOAL_TYPES } from '../../lib/sessions';
import styles from './GoalForm.module.css';

export default function GoalForm({ onSubmit, disabled = false }) {
  const [values, setValues] = useState({
    goal_type: GOAL_TYPES.PERCENT,
    goal_profit: '',
    goal_loss: '',
  });
  const [errors, setErrors] = useState({});

  function handleChange(e) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    const { valid, errors: newErrors } = validateGoalForm(values);
    if (!valid) {
      setErrors(newErrors);
      return;
    }
    onSubmit(values);
  }

  const unit = values.goal_type === GOAL_TYPES.PERCENT ? '%' : 'R$';

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      <div className={styles.row}>
        <label htmlFor="goal_type">Tipo de meta</label>
        <select
          id="goal_type"
          name="goal_type"
          value={values.goal_type}
          onChange={handleChange}
          disabled={disabled}
          className={styles.select}
        >
          <option value={GOAL_TYPES.PERCENT}>Percentual (%)</option>
          <option value={GOAL_TYPES.VALUE}>Valor (R$)</option>
        </select>
        {errors.goal_type && (
          <span role="alert" className={styles.error}>
            {errors.goal_type}
          </span>
        )}
      </div>

      <div className={styles.row}>
        <label htmlFor="goal_profit">Meta de ganho ({unit})</label>
        <input
          id="goal_profit"
          name="goal_profit"
          type="number"
          min="0"
          step="0.01"
          value={values.goal_profit}
          onChange={handleChange}
          disabled={disabled}
          placeholder={values.goal_type === GOAL_TYPES.PERCENT ? 'ex.: 2.5' : 'ex.: 500'}
          className={styles.input}
        />
        {errors.goal_profit && (
          <span role="alert" className={styles.error}>
            {errors.goal_profit}
          </span>
        )}
      </div>

      <div className={styles.row}>
        <label htmlFor="goal_loss">Limite de perda ({unit})</label>
        <input
          id="goal_loss"
          name="goal_loss"
          type="number"
          min="0"
          step="0.01"
          value={values.goal_loss}
          onChange={handleChange}
          disabled={disabled}
          placeholder={values.goal_type === GOAL_TYPES.PERCENT ? 'ex.: 1.5' : 'ex.: 200'}
          className={styles.input}
        />
        {errors.goal_loss && (
          <span role="alert" className={styles.error}>
            {errors.goal_loss}
          </span>
        )}
      </div>

      <button type="submit" disabled={disabled} className={styles.submitBtn}>
        {disabled ? 'Aguarde…' : 'Iniciar sessão'}
      </button>
    </form>
  );
}
