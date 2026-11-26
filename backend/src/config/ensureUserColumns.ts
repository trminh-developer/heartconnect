import { DataTypes } from 'sequelize';
import sequelize from './db';

// sync() alone does not add fields to existing databases.
export async function ensureUserColumns() {
  await ensurePaymentColumns();
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  if (!tables.includes('users')) return;
  const columns = await query.describeTable('users');
  const additions = {
    premium_plan_id: DataTypes.STRING,
    app_logo: DataTypes.TEXT('long'),
    name_changed_at: DataTypes.DATE,
    username_changed_at: DataTypes.DATE,
    location_updated_at: DataTypes.DATE,
    dating_visible: DataTypes.BOOLEAN,
  };
  for (const [name, type] of Object.entries(additions)) {
    if (!columns[name]) await query.addColumn('users', name, { type, allowNull: name !== 'dating_visible', ...(name === 'dating_visible' ? { defaultValue: true } : {}) });
  }
  try {
    await sequelize.query("UPDATE users SET dating_visible = 1 WHERE dating_visible IS NULL");
  } catch {
    // Ignore dialect errors on non-existent column
  }
  if (!tables.includes('user_preferences')) return;
  const preferences = await query.describeTable('user_preferences');
  const preferenceAdditions = {
    relationship_goal: { type: DataTypes.STRING, allowNull: true },
    accepted_goals: { type: DataTypes.JSON, allowNull: true },
    goal_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    distance_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    distance_half_life: { type: DataTypes.FLOAT, defaultValue: 10 },
  };
  for (const [name, definition] of Object.entries(preferenceAdditions)) {
    if (!preferences[name]) await query.addColumn('user_preferences', name, definition);
  }
  if (tables.includes('user_swipes')) {
    const swipes = await query.describeTable('user_swipes');
    if (!swipes.expires_at) await query.addColumn('user_swipes', 'expires_at', { type: DataTypes.DATE, allowNull: true });
  }
  if (tables.includes('matches')) {
    const matches = await query.describeTable('matches');
    if (!matches.pair_key) await query.addColumn('matches', 'pair_key', { type: DataTypes.STRING(201), allowNull: true });
  }
  if (tables.includes('statuses')) {
    const statuses = await query.describeTable('statuses');
    if (!statuses.is_hidden) await query.addColumn('statuses', 'is_hidden', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
    if (!statuses.hidden_at) await query.addColumn('statuses', 'hidden_at', { type: DataTypes.DATE, allowNull: true });
  }
}

export async function ensurePaymentColumns() {
  const query = sequelize.getQueryInterface();
  const tables = await query.showAllTables();
  if (tables.includes('transactions')) {
    const payments = await query.describeTable('transactions');
    const paymentAdditions = {
      payment_details: DataTypes.JSON, provider_reference: DataTypes.STRING(100), paid_at: DataTypes.DATE, confirmed_by: DataTypes.STRING,
    };
    for (const [name, type] of Object.entries(paymentAdditions)) {
      if (!payments[name]) await query.addColumn('transactions', name, { type, allowNull: true });
    }
    const indexes = await query.showIndex('transactions') as { name: string }[];
    if (!indexes.some(index => index.name === 'transactions_provider_reference_unique')) {
      await query.addIndex('transactions', ['provider_reference'], { name: 'transactions_provider_reference_unique', unique: true });
    }
  }
}
