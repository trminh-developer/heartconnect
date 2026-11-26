import { DataTypes, Model } from "sequelize";
import sequelize from "../config/db";

class User extends Model {}
User.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    password: { type: DataTypes.STRING, allowNull: false },
    username: { type: DataTypes.STRING, unique: true, allowNull: false },
    first_name: { type: DataTypes.STRING },
    last_name: { type: DataTypes.STRING },
    avatar: { type: DataTypes.TEXT("long") },
    cover_photo: { type: DataTypes.TEXT("long") },
    gender: { type: DataTypes.STRING },
    date_of_birth: { type: DataTypes.DATEONLY },
    city: { type: DataTypes.STRING },
    country: { type: DataTypes.STRING },
    latitude: { type: DataTypes.FLOAT },
    longitude: { type: DataTypes.FLOAT },
    location_updated_at: { type: DataTypes.DATE },
    dating_visible: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    bio: { type: DataTypes.TEXT },
    profession: { type: DataTypes.STRING },
    education: { type: DataTypes.STRING },
    photos: { type: DataTypes.JSON },
    relationship_goal: { type: DataTypes.STRING },
    is_online: { type: DataTypes.BOOLEAN, defaultValue: false },
    last_active: { type: DataTypes.DATE },
    is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    role: {
      type: DataTypes.ENUM("ADMIN", "CENSOR", "USER"),
      defaultValue: "USER",
    },
    status: {
      type: DataTypes.ENUM("ACTIVE", "BANNED", "DELETED"),
      defaultValue: "ACTIVE",
    },
    violation_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_premium: { type: DataTypes.BOOLEAN, defaultValue: false },
    premium_expires_at: { type: DataTypes.DATE },
    premium_plan_id: { type: DataTypes.STRING },
    app_logo: { type: DataTypes.TEXT("long") },
    name_changed_at: { type: DataTypes.DATE },
    username_changed_at: { type: DataTypes.DATE },
  },
  { sequelize, modelName: "User", tableName: "users", timestamps: true,
    indexes: [{ fields: ['status', 'role', 'dating_visible', 'date_of_birth'] },
      { fields: ['status', 'dating_visible', 'last_active', 'id'] },
      { fields: ['status', 'dating_visible', 'createdAt', 'id'] },
      { fields: ['latitude', 'longitude'] }] },
);

class RefreshSession extends Model {}
RefreshSession.init({
  token_hash: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
  user_id: { type: DataTypes.UUID, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize, modelName: 'RefreshSession', tableName: 'refresh_sessions', timestamps: false,
  indexes: [{ fields: ['user_id'] }, { fields: ['expires_at'] }],
});

class UserPreference extends Model {}
UserPreference.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    preferred_gender: { type: DataTypes.JSON },
    age_min: { type: DataTypes.INTEGER },
    age_max: { type: DataTypes.INTEGER },
    max_distance: { type: DataTypes.INTEGER },
    relationship_goal: { type: DataTypes.STRING },
    accepted_goals: { type: DataTypes.JSON },
    goal_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    distance_required: { type: DataTypes.BOOLEAN, defaultValue: false },
    distance_half_life: { type: DataTypes.FLOAT, defaultValue: 10 },
  },
  {
    sequelize,
    modelName: "UserPreference",
    tableName: "user_preferences",
    timestamps: false,
    indexes: [{ fields: ['user_id'] }],
  },
);

class Interest extends Model {}
Interest.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    icon: { type: DataTypes.STRING },
    category: { type: DataTypes.STRING },
  },
  {
    sequelize,
    modelName: "Interest",
    tableName: "interests",
    timestamps: false,
  },
);

class UserInterest extends Model {}
UserInterest.init(
  {
    user_id: { type: DataTypes.UUID, primaryKey: true },
    interest_id: { type: DataTypes.UUID, primaryKey: true },
  },
  {
    sequelize,
    modelName: "UserInterest",
    tableName: "user_interests",
    timestamps: false,
    indexes: [{ fields: ['interest_id', 'user_id'] }],
  },
);

class Match extends Model {}
Match.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user1_id: { type: DataTypes.UUID, allowNull: false },
    user2_id: { type: DataTypes.UUID, allowNull: false },
    pair_key: { type: DataTypes.STRING(201), allowNull: true },
    match_percentage: { type: DataTypes.FLOAT },
    matched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  { sequelize, modelName: "Match", tableName: "matches", timestamps: false,
    indexes: [{ fields: ['pair_key'], unique: true }, { fields: ['user1_id', 'user2_id'] }, { fields: ['user2_id'] }] },
);

class UserSwipe extends Model {}
UserSwipe.init(
  {
    user_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    target_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    action: { type: DataTypes.STRING, allowNull: false },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
    expires_at: { type: DataTypes.DATE },
  },
  { sequelize, modelName: 'UserSwipe', tableName: 'user_swipes', timestamps: false,
    indexes: [{ fields: ['target_id', 'action'] }] },
);

class UserBlock extends Model {}
UserBlock.init(
  {
    user_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    target_id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
  },
  { sequelize, modelName: 'UserBlock', tableName: 'user_blocks', timestamps: false,
    indexes: [{ fields: ['target_id'] }] },
);

class PairState extends Model {}
PairState.init({
  user_low_id: { type: DataTypes.UUID, primaryKey: true },
  user_high_id: { type: DataTypes.UUID, primaryKey: true },
  state: { type: DataTypes.STRING, defaultValue: 'open', allowNull: false },
}, { sequelize, modelName: 'PairState', tableName: 'pair_states', timestamps: false,
  indexes: [{ fields: ['user_high_id', 'state'] }] });

class DatingRequest extends Model {}
DatingRequest.init({
  user_id: { type: DataTypes.UUID, primaryKey: true },
  request_id: { type: DataTypes.STRING(100), primaryKey: true },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  response: { type: DataTypes.JSON, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { sequelize, modelName: 'DatingRequest', tableName: 'dating_requests', timestamps: false });

class DiscoverySession extends Model {}
DiscoverySession.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.UUID, allowNull: false },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  entries: { type: DataTypes.JSON, allowNull: false },
  delivered_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, { sequelize, modelName: 'DiscoverySession', tableName: 'discovery_sessions', timestamps: false,
  indexes: [{ fields: ['user_id', 'expires_at'] }] });

class DiscoveryImpression extends Model {}
DiscoveryImpression.init({
  session_id: { type: DataTypes.UUID, primaryKey: true },
  target_id: { type: DataTypes.UUID, primaryKey: true },
  user_id: { type: DataTypes.UUID, allowNull: false },
  shown_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  algorithm_version: { type: DataTypes.STRING, allowNull: false },
  features: { type: DataTypes.JSON },
}, { sequelize, modelName: 'DiscoveryImpression', tableName: 'discovery_impressions', timestamps: false,
  indexes: [{ fields: ['user_id', 'shown_at'] }] });

class DatingEvent extends Model {}
DatingEvent.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.UUID, allowNull: false },
  target_id: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  algorithm_version: { type: DataTypes.STRING, allowNull: false },
  features: { type: DataTypes.JSON },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { sequelize, modelName: 'DatingEvent', tableName: 'dating_events', timestamps: false,
  indexes: [{ fields: ['type', 'created_at'] }, { fields: ['user_id', 'target_id'] }] });

class Conversation extends Model {}
Conversation.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    match_id: { type: DataTypes.UUID, allowNull: false },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Conversation",
    tableName: "conversations",
    timestamps: false,
  },
);

class Message extends Model {}
Message.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    conversation_id: { type: DataTypes.UUID, allowNull: false },
    sender_id: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING, defaultValue: "text" },
    status: { type: DataTypes.STRING, defaultValue: "sent" },
    is_recalled: { type: DataTypes.BOOLEAN, defaultValue: false },
    deleted_for: { type: DataTypes.JSON, defaultValue: [] },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Message",
    tableName: "messages",
    timestamps: false,
    indexes: [
      { fields: ["conversation_id", "created_at"] },
      { fields: ["sender_id"] },
    ],
  },
);

class CallSession extends Model {}
CallSession.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  conversation_id: { type: DataTypes.UUID, allowNull: false },
  caller_id: { type: DataTypes.UUID, allowNull: false },
  callee_id: { type: DataTypes.UUID, allowNull: false },
  mode: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'ringing' },
  reason: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expires_at: { type: DataTypes.DATE, allowNull: false },
  accepted_at: { type: DataTypes.DATE },
  ended_at: { type: DataTypes.DATE },
  ringing_at: { type: DataTypes.DATE },
  caller_seen_at: { type: DataTypes.DATE },
  callee_seen_at: { type: DataTypes.DATE },
}, { sequelize, modelName: 'CallSession', tableName: 'call_sessions', timestamps: false,
  indexes: [{ fields: ['callee_id', 'status'] }, { fields: ['status', 'expires_at'] }] });
CallSession.belongsTo(Conversation, { foreignKey: 'conversation_id', onDelete: 'CASCADE' });
CallSession.belongsTo(User, { as: 'Caller', foreignKey: 'caller_id', onDelete: 'CASCADE' });
CallSession.belongsTo(User, { as: 'Callee', foreignKey: 'callee_id', onDelete: 'CASCADE' });

// A unique reservation per user prevents simultaneous calls, even across instances.
class CallParticipant extends Model {}
CallParticipant.init({
  user_id: { type: DataTypes.UUID, primaryKey: true },
  call_id: { type: DataTypes.UUID, allowNull: false },
}, { sequelize, modelName: 'CallParticipant', tableName: 'call_participants', timestamps: false });
CallParticipant.belongsTo(CallSession, { foreignKey: 'call_id', onDelete: 'CASCADE' });
CallParticipant.belongsTo(User, { foreignKey: 'user_id', onDelete: 'CASCADE' });

class CallSignal extends Model {}
CallSignal.init({
  seq: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  request_id: { type: DataTypes.UUID, unique: true, allowNull: false },
  call_id: { type: DataTypes.UUID, allowNull: false },
  sender_id: { type: DataTypes.UUID, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
}, { sequelize, modelName: 'CallSignal', tableName: 'call_signals', timestamps: false,
  indexes: [{ fields: ['call_id', 'seq'] }] });
CallSignal.belongsTo(CallSession, { foreignKey: 'call_id', onDelete: 'CASCADE' });

class CallPresence extends Model {}
CallPresence.init({
  user_id: { type: DataTypes.UUID, primaryKey: true },
  device_id: { type: DataTypes.UUID, primaryKey: true },
  seen_at: { type: DataTypes.DATE, allowNull: false },
}, { sequelize, modelName: 'CallPresence', tableName: 'call_presence', timestamps: false });
CallPresence.belongsTo(User, { foreignKey: 'user_id', onDelete: 'CASCADE' });

class Notification extends Model {}
Notification.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    from_user_id: { type: DataTypes.UUID, allowNull: true },
    type: { type: DataTypes.STRING },
    message: { type: DataTypes.TEXT },
    is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Notification",
    tableName: "notifications",
    timestamps: false,
    indexes: [
      { fields: ["user_id", "created_at"] },
      { fields: ["user_id", "is_read"] },
    ],
  },
);

class Status extends Model {}
Status.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT },
    media_urls: { type: DataTypes.JSON },
    is_hidden: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    hidden_at: { type: DataTypes.DATE },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Status",
    tableName: "statuses",
    timestamps: false,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["created_at"] },
      { fields: ["user_id", "created_at"] },
    ],
  },
);

class Story extends Model {}
Story.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  user_id: { type: DataTypes.UUID, allowNull: false },
  media_type: { type: DataTypes.STRING, allowNull: false },
  media_url: { type: DataTypes.TEXT('long') },
  text_content: { type: DataTypes.TEXT },
  background_color: { type: DataTypes.STRING(9) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, allowNull: false },
  expires_at: { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize, modelName: 'Story', tableName: 'stories', timestamps: false,
  indexes: [{ fields: ['expires_at'] }, { fields: ['user_id', 'created_at'] }],
});

class StatusLike extends Model {}
StatusLike.init(
  {
    status_id: { type: DataTypes.UUID, primaryKey: true },
    user_id: { type: DataTypes.UUID, primaryKey: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "StatusLike",
    tableName: "status_likes",
    timestamps: false,
  },
);

class StatusComment extends Model {}
StatusComment.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    status_id: { type: DataTypes.UUID, allowNull: false },
    user_id: { type: DataTypes.UUID, allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "StatusComment",
    tableName: "status_comments",
    timestamps: false,
    indexes: [{ fields: ["status_id"] }, { fields: ["created_at"] }],
  },
);

class VerificationRequest extends Model {}
VerificationRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    id_card_image: { type: DataTypes.TEXT("long") },
    selfie_image: { type: DataTypes.TEXT("long") },
    status: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
      defaultValue: "PENDING",
    },
  },
  {
    sequelize,
    modelName: "VerificationRequest",
    tableName: "verification_requests",
    timestamps: true,
  },
);

User.hasMany(VerificationRequest, {
  foreignKey: "user_id",
  as: "verification_requests",
});
VerificationRequest.belongsTo(User, { foreignKey: "user_id", as: "user" });

// Associations
User.hasMany(RefreshSession, { foreignKey: 'user_id', onDelete: 'CASCADE' });
RefreshSession.belongsTo(User, { foreignKey: 'user_id', onDelete: 'CASCADE' });

User.hasOne(UserPreference, { foreignKey: "user_id" });
UserPreference.belongsTo(User, { foreignKey: "user_id" });

User.belongsToMany(Interest, {
  through: UserInterest,
  foreignKey: "user_id",
  as: "interests",
});
Interest.belongsToMany(User, {
  through: UserInterest,
  foreignKey: "interest_id",
  as: "users",
});

User.hasMany(Match, { foreignKey: "user1_id", as: "Matches1" });
User.hasMany(Match, { foreignKey: "user2_id", as: "Matches2" });
Match.belongsTo(User, { foreignKey: "user1_id", as: "User1" });
Match.belongsTo(User, { foreignKey: "user2_id", as: "User2" });

Match.hasOne(Conversation, { foreignKey: "match_id" });
Conversation.belongsTo(Match, { foreignKey: "match_id" });

Conversation.hasMany(Message, { foreignKey: "conversation_id" });
Message.belongsTo(Conversation, { foreignKey: "conversation_id" });

User.hasMany(Message, { foreignKey: "sender_id" });
Message.belongsTo(User, { foreignKey: "sender_id" });

User.hasMany(Notification, {
  foreignKey: "user_id",
  as: "ReceivedNotifications",
});
Notification.belongsTo(User, { foreignKey: "user_id", as: "Receiver" });
User.hasMany(Notification, {
  foreignKey: "from_user_id",
  as: "SentNotifications",
});
Notification.belongsTo(User, { foreignKey: "from_user_id", as: "FromUser" });

User.hasMany(Status, { foreignKey: "user_id" });
Status.belongsTo(User, { foreignKey: "user_id" });
User.hasMany(Story, { foreignKey: 'user_id', onDelete: 'CASCADE' });
Story.belongsTo(User, { foreignKey: 'user_id', onDelete: 'CASCADE' });

Status.hasMany(StatusLike, { foreignKey: "status_id" });
StatusLike.belongsTo(Status, { foreignKey: "status_id" });

User.hasMany(StatusLike, { foreignKey: "user_id" });
StatusLike.belongsTo(User, { foreignKey: "user_id" });

Status.hasMany(StatusComment, { foreignKey: "status_id" });
StatusComment.belongsTo(Status, { foreignKey: "status_id" });

User.hasMany(StatusComment, { foreignKey: "user_id" });
StatusComment.belongsTo(User, { foreignKey: "user_id" });

class Report extends Model {}
Report.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    reporter_id: { type: DataTypes.UUID, allowNull: false },
    reported_user_id: { type: DataTypes.UUID, allowNull: true }, // can be null if reporting a post
    reported_status_id: { type: DataTypes.UUID, allowNull: true },
    reason: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    status: {
      type: DataTypes.ENUM("PENDING", "RESOLVED", "DISMISSED"),
      defaultValue: "PENDING",
    },
  },
  { sequelize, modelName: "Report", tableName: "reports", timestamps: true },
);

Report.belongsTo(User, { foreignKey: "reporter_id", as: "Reporter" });
Report.belongsTo(User, { foreignKey: "reported_user_id", as: "ReportedUser" });
Report.belongsTo(Status, {
  foreignKey: "reported_status_id",
  as: "ReportedStatus",
});

class Transaction extends Model {}
Transaction.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    user_id: { type: DataTypes.UUID, allowNull: false },
    plan_id: { type: DataTypes.STRING, allowNull: false },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    status: { type: DataTypes.STRING, defaultValue: "PENDING" },
    provider: { type: DataTypes.STRING, allowNull: false },
    payment_details: { type: DataTypes.JSON, allowNull: true },
    provider_reference: { type: DataTypes.STRING(100), allowNull: true },
    paid_at: { type: DataTypes.DATE, allowNull: true },
    confirmed_by: { type: DataTypes.STRING, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    modelName: "Transaction",
    tableName: "transactions",
    timestamps: false,
    indexes: [{ name: 'transactions_provider_reference_unique', unique: true, fields: ['provider_reference'] }],
  },
);

class SystemSetting extends Model {}
SystemSetting.init(
  {
    key: { type: DataTypes.STRING, primaryKey: true, allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true },
  },
  {
    sequelize,
    modelName: "SystemSetting",
    tableName: "system_settings",
    timestamps: true,
  },
);

export {
  sequelize,
  User,
  RefreshSession,
  UserPreference,
  Interest,
  UserInterest,
  UserSwipe,
  UserBlock,
  PairState,
  DatingRequest,
  DiscoverySession,
  DiscoveryImpression,
  DatingEvent,
  Match,
  Conversation,
  Message,
  CallSession,
  CallParticipant,
  CallSignal,
  CallPresence,
  Notification,
  Status,
  Story,
  StatusLike,
  StatusComment,
  Report,
  VerificationRequest,
  Transaction,
  SystemSetting,
};
