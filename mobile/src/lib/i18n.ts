/**
 * App interface translations (i18n).
 * French is the default; English switches on user preference or phone locale.
 *
 * Usage in the app:  t('add_food')  -> "Ajouter un aliment" or "Add food"
 * Every visible string is a key here — never hard-code text in screens,
 * so adding a language later means only editing this file.
 */

export type Lang = "fr" | "en";

export const translations: Record<string, Record<Lang, string>> = {
  // --- tabs ---
  tab_today:        { fr: "Aujourd'hui",        en: "Today" },
  tab_history:      { fr: "Historique",          en: "History" },
  tab_weight:       { fr: "Poids",               en: "Weight" },

  // --- today screen ---
  left_to_eat:      { fr: "Restant à manger",    en: "Left to eat today" },
  kcal:             { fr: "kcal",                 en: "kcal" },
  eaten:            { fr: "Mangé",                en: "Eaten" },
  target:           { fr: "Objectif",             en: "Target" },
  over_by:          { fr: "Dépassé de",           en: "Over by" },
  steps_done:       { fr: "10 000 pas atteints",  en: "10,000 steps done" },
  steps_prompt:     { fr: "Touchez quand vous atteignez vos pas",
                      en: "Tap when you hit your steps" },
  streak:           { fr: "jours de suite — continuez",
                      en: "day streak — keep it going" },

  // --- add food ---
  add_food:         { fr: "Ajouter un aliment",   en: "Add food" },
  for_today:        { fr: "Pour aujourd'hui",     en: "For today" },
  for_yesterday:    { fr: "Pour hier",            en: "For yesterday" },
  breakfast:        { fr: "Petit-déjeuner",       en: "Breakfast" },
  lunch:            { fr: "Déjeuner",             en: "Lunch" },
  dinner:           { fr: "Dîner",                en: "Dinner" },
  snack:            { fr: "Collations",           en: "Snacks" },
  search_placeholder: { fr: "Tapez un aliment… ex. ndolé, riz, œuf",
                        en: "Type a food… e.g. ndole, rice, egg" },
  how_many_grams:   { fr: "Combien de grammes ?", en: "How many grams?" },
  how_many_pieces:  { fr: "Combien de morceaux ?",en: "How many pieces?" },
  add_to:           { fr: "Ajouter à",            en: "Add to" },

  // --- history ---
  within_budget:    { fr: "✓ dans l'objectif",    en: "✓ within budget" },
  over_budget_by:   { fr: "dépassé de",           en: "over by" },
  tap_to_see:       { fr: "Toucher pour voir les aliments",
                      en: "Tap to see foods" },
  no_history:       { fr: "Aucune journée enregistrée",
                      en: "No days logged yet" },

  // --- weight ---
  progress:         { fr: "Progression",          en: "Progress" },
  start_kg:         { fr: "départ kg",            en: "start kg" },
  now_kg:           { fr: "actuel kg",            en: "now kg" },
  goal_kg:          { fr: "objectif kg",          en: "goal kg" },
  log_weight:       { fr: "Enregistrer le poids du jour",
                      en: "Log today's weight" },
  log:              { fr: "Enregistrer",          en: "Log" },
  weigh_tip:        { fr: "Astuce : pesez-vous une fois par semaine, à la même heure. Les variations de ±1 kg sont de l'eau, pas de la graisse.",
                      en: "Tip: weigh in once a week, same time of day. ±1 kg swings are water, not fat." },

  // --- onboarding / calorie engine ---
  onboarding_sex:   { fr: "Vous êtes",            en: "You are" },
  female:           { fr: "Une femme",            en: "Female" },
  male:             { fr: "Un homme",             en: "Male" },
  your_age:         { fr: "Votre âge",            en: "Your age" },
  your_height:      { fr: "Votre taille (cm)",    en: "Your height (cm)" },
  your_weight:      { fr: "Votre poids (kg)",     en: "Your weight (kg)" },
  your_goal:        { fr: "Votre objectif",       en: "Your goal" },
  goal_lose:        { fr: "Perdre du poids",      en: "Lose weight" },
  goal_maintain:    { fr: "Maintenir mon poids",  en: "Maintain weight" },
  goal_gain:        { fr: "Prendre du poids",     en: "Gain weight" },
  your_maintenance: { fr: "Votre maintien",       en: "Your maintenance" },
  your_daily_target:{ fr: "Votre objectif quotidien", en: "Your daily target" },
  estimated_time:   { fr: "Temps estimé",         en: "Estimated time" },
  weeks:            { fr: "semaines",             en: "weeks" },

  // --- misc ---
  saved:            { fr: "Enregistré",           en: "Saved" },
  loading:          { fr: "Chargement…",          en: "Loading…" },

  // --- app identity ---
  app_name:         { fr: "CalTrack",             en: "CalTrack" },
  start_tracking:   { fr: "Commencer",            en: "Start tracking" },
  floor_note:       { fr: "Minimum sécuritaire appliqué. Plus lent, c'est plus sain.",
                      en: "Safe minimum applied. Slower is healthier." },

  // --- standard measure labels (shown on picker chips) ---
  measure_gram:      { fr: "g",            en: "g" },
  measure_ml:        { fr: "ml",           en: "ml" },
  measure_teaspoon:  { fr: "c. à café",    en: "tsp" },
  measure_tablespoon:{ fr: "c. à soupe",   en: "tbsp" },
  measure_cup:       { fr: "tasse",        en: "cup" },
  measure_piece:     { fr: "pièce",        en: "piece" },
  measure_handful:   { fr: "poignée",      en: "handful" },
  measure_ladle:     { fr: "louche",       en: "ladle" },
  measure_glass:     { fr: "verre",        en: "glass" },

  // --- measure picker UI ---
  choose_measure:   { fr: "Quelle mesure ?",       en: "Which measure?" },
  quantity:         { fr: "Quantité",              en: "Quantity" },
  confirm:          { fr: "Ajouter",               en: "Add" },
  no_entries:       { fr: "Rien de mangé ici",     en: "Nothing logged here" },
  add_to_meal:      { fr: "Ajouter à ce repas",    en: "Add to this meal" },
  no_profile:       { fr: "Complétez le questionnaire pour commencer à suivre vos calories.",
                      en: "Complete the questionnaire to start tracking your calories." },
};

/** Simple translator. Falls back to French, then to the key itself. */
export function makeT(lang: Lang) {
  return (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry.fr || key;
  };
}

/** Pick default language: saved preference > phone locale > French. */
export function resolveDefaultLang(deviceLocale?: string, saved?: Lang): Lang {
  if (saved === "fr" || saved === "en") return saved;
  if (deviceLocale && deviceLocale.toLowerCase().startsWith("en")) return "en";
  return "fr"; // default for the Cameroon market
}
