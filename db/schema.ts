import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const classrooms = sqliteTable('classrooms', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), name: text('name').notNull(),
  joinCode: text('join_code').notNull(), isOpen: integer('is_open').notNull().default(1), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('classrooms_code_unique').on(t.joinCode), index('classrooms_owner').on(t.ownerId)]);

export const members = sqliteTable('members', {
  id: text('id').primaryKey(), classId: text('class_id').notNull().references(()=>classrooms.id),
  displayName: text('display_name').notNull(), studentNumber: text('student_number').notNull().default(''),
  tokenHash: text('token_hash').notNull(), createdAt: text('created_at').notNull(),
}, t => [uniqueIndex('members_token_unique').on(t.tokenHash), index('members_class').on(t.classId)]);

export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), classId: text('class_id').notNull().references(()=>classrooms.id),
  memberId: text('member_id').notNull().references(()=>members.id), lesson: integer('lesson').notNull(),
  answer: text('answer').notNull(), evidence: text('evidence').notNull(), revision: integer('revision').notNull().default(1),
  reviewedRevision: integer('reviewed_revision').notNull().default(0), feedback: text('feedback').notNull().default(''),
  featured: integer('featured').notNull().default(0), submittedAt: text('submitted_at').notNull(),
}, t => [uniqueIndex('submissions_member_lesson').on(t.memberId,t.lesson), index('submissions_class_lesson').on(t.classId,t.lesson)]);

export const modelEntries = sqliteTable('model_entries', {
  id:text('id').primaryKey(),classId:text('class_id').notNull().references(()=>classrooms.id),
  memberId:text('member_id').notNull().references(()=>members.id),benchmarkId:text('benchmark_id').notNull(),
  modelName:text('model_name').notNull(),modelKey:text('model_key').notNull(),modelDigest:text('model_digest').notNull(),
  correct:integer('correct').notNull(),total:integer('total').notNull(),accuracy:real('accuracy').notNull(),
  metrics:text('metrics').notNull(),hyperparameters:text('hyperparameters').notNull(),createdAt:text('created_at').notNull(),
},t=>[uniqueIndex('models_member_digest').on(t.memberId,t.benchmarkId,t.modelDigest),index('models_class_benchmark').on(t.classId,t.benchmarkId)]);
