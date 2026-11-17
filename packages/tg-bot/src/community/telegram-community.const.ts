/** Срок бана при исключении, секунд: страховка на случай, если unban не прошёл. */
export const EXCLUDE_BAN_SECONDS = 300;

/** Нижняя граница `until_date`, секунд Unix (сентябрь 2020): меньше — часы не в секундах или сбиты. */
export const MIN_UNIX_SECONDS = 1_600_000_000;
