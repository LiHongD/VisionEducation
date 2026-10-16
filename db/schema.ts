import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

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
