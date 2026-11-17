/** Handle группы: каноническое десятичное целое < 0 (группа и супергруппа Telegram). */
export const COMMUNITY_HANDLE = /^-[1-9][0-9]*$/;

/** Handle участника: каноническое десятичное целое > 0. */
export const MEMBER_HANDLE = /^[1-9][0-9]*$/;

/** Срок бана при исключении, секунд: страховка на случай, если unban не прошёл. */
export const EXCLUDE_BAN_SECONDS = 60;
