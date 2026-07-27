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
  tab_home:         { fr: "Accueil",             en: "Home" },
  tab_today:        { fr: "Aujourd'hui",        en: "Today" },
  tab_history:      { fr: "Historique",          en: "History" },
  tab_weight:       { fr: "Poids",               en: "Weight" },
  tab_settings:     { fr: "Profil",              en: "Profile" },
  language:         { fr: "Langue",              en: "Language" },

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
  add_food:         { fr: "Ajoutez un aliment",   en: "Add food" },
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
  start_kg:         { fr: "Départ",               en: "Start" },
  now_kg:           { fr: "Actuel",               en: "Current" },
  goal_kg:          { fr: "Objectif",             en: "Goal" },
  log_weight:       { fr: "Enregistrer le poids du jour",
                      en: "Log today's weight" },
  log_weight_short: { fr: "Peser",               en: "Weigh in" },
  log:              { fr: "Enregistrer",          en: "Log" },
  weigh_tip:        { fr: "Astuce : pesez-vous une fois par semaine, à la même heure. Les variations de ±1 kg sont de l'eau, pas de la graisse.",
                      en: "Tip: weigh in once a week, same time of day. ±1 kg swings are water, not fat." },
  no_weigh_ins:     { fr: "Aucune pesée enregistrée",
                      en: "No weigh-ins logged yet" },
  weigh_today:      { fr: "Votre poids aujourd'hui (kg)",
                      en: "Your weight today (kg)" },
  vs_prev:          { fr: "vs précédent",         en: "vs previous" },
  steps_10k:        { fr: "10 000 pas",           en: "10k steps" },
  streak_days:      { fr: "jours de suite",       en: "day streak" },

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

  // --- activity level picker ---
  your_activity:        { fr: "Votre niveau d'activité", en: "Your activity level" },
  act_sedentary:        { fr: "Sédentaire",              en: "Sedentary" },
  act_sedentary_desc:   { fr: "Bureau, peu de marche — moins de 5 000 pas/jour",
                          en: "Desk job, little walking — under 5,000 steps/day" },
  act_light:            { fr: "Légèrement actif",        en: "Lightly active" },
  act_light_desc:       { fr: "Bureau + marche quotidienne — environ 10 000 pas",
                          en: "Desk job plus a daily walk — around 10,000 steps" },
  act_moderate:         { fr: "Modérément actif",        en: "Moderately active" },
  act_moderate_desc:    { fr: "Souvent debout, ou exercice 3-5×/semaine",
                          en: "On your feet often, or exercise 3-5×/week" },
  act_active:           { fr: "Très actif",              en: "Very active" },
  act_active_desc:      { fr: "Travail physique, ou entraînement intense 6-7×/semaine",
                          en: "Physical job, or hard training 6-7×/week" },
  act_very_active:      { fr: "Extrêmement actif",       en: "Extremely active" },
  act_very_active_desc: { fr: "Travail manuel lourd + entraînement quotidien",
                          en: "Heavy manual labour plus daily training" },
  act_hint:             { fr: "La plupart des gens qui travaillent assis et marchent chaque jour devraient choisir « Légèrement actif ».",
                          en: "Most people who work sitting down and walk daily should choose Light." },

  // --- timeline (result card) ---
  target_date:      { fr: "Objectif atteint vers",  en: "Goal reached around" },
  weekly_pace:      { fr: "Rythme",                 en: "Pace" },
  steady_loss_note: { fr: "Régulier et durable — pas de yoyo.",
                      en: "Steady and sustainable — no yo-yo." },

  // --- macros / charts ---
  protein:          { fr: "Protéines",             en: "Protein" },
  carbs:            { fr: "Glucides",              en: "Carbs" },
  fat:              { fr: "Lipides",               en: "Fat" },
  macros:           { fr: "Macros",                en: "Macros" },
  protein_target:   { fr: "Objectif protéines",   en: "Protein target" },
  no_data:          { fr: "Aucune donnée",         en: "No data" },
  daily_cals:       { fr: "Calories / jour",       en: "Calories / day" },
  last_14_days:     { fr: "14 derniers jours",     en: "Last 14 days" },

  // --- misc ---
  saved:            { fr: "Enregistré",           en: "Saved" },
  loading:          { fr: "Chargement…",          en: "Loading…" },

  // --- app identity ---
  app_name:         { fr: "CalTrack",             en: "CalTrack" },
  start_tracking:   { fr: "Commencer",            en: "Start tracking" },
  save_profile:     { fr: "Enregistrer",          en: "Save" },
  floor_note:       { fr: "Minimum sécuritaire appliqué. Plus lent, c'est plus sain.",
                      en: "Safe minimum applied. Slower is healthier." },

  // --- onboarding input placeholders ---
  ph_age:           { fr: "ans",                  en: "years" },
  ph_height:        { fr: "cm",                   en: "cm" },
  ph_weight:        { fr: "kg",                   en: "kg" },
  onboarding_hint:  { fr: "Remplissez tous les champs pour continuer",
                      en: "Fill in all fields to continue" },

  // --- reset ---
  reset_data:         { fr: "Effacer toutes mes données",
                        en: "Erase all my data" },
  reset_confirm_title:{ fr: "Tout effacer ?",
                        en: "Erase everything?" },
  reset_confirm_msg:  { fr: "Cela supprimera définitivement votre profil, vos repas, vos pesées et tout votre historique. Cette action est irréversible.",
                        en: "This will permanently delete your profile, food logs, weigh-ins, and all history. This cannot be undone." },
  reset_yes:          { fr: "Tout effacer",       en: "Erase everything" },
  reset_no:           { fr: "Annuler",            en: "Cancel" },

  // --- barcode scanner ---
  scan_barcode:      { fr: "Scanner un code-barres",  en: "Scan a barcode" },
  scanning:          { fr: "Pointez vers un code-barres",
                       en: "Point at a barcode" },
  camera_permission: { fr: "L'accès à la caméra est nécessaire pour scanner les codes-barres.",
                       en: "Camera access is needed to scan barcodes." },
  grant_permission:  { fr: "Autoriser la caméra",     en: "Grant camera access" },
  product_not_found: { fr: "Produit inconnu — ajoutez-le manuellement.",
                       en: "Product not found — add it manually." },
  add_product:       { fr: "Ajouter ce produit",      en: "Add this product" },
  product_name:      { fr: "Nom du produit",           en: "Product name" },
  kcal_per_100g:     { fr: "kcal pour 100 g",          en: "kcal per 100 g" },
  save_product:      { fr: "Enregistrer et ajouter",   en: "Save and add" },
  scan_again:        { fr: "Scanner à nouveau",        en: "Scan again" },
  no_internet_scan:  { fr: "Hors ligne — le produit sera sauvegardé localement pour les prochains scans.",
                       en: "Offline — product saved locally for future scans." },

  // --- custom meals / recipe builder ---
  my_meals:         { fr: "Mes repas",                en: "My meals" },
  foods_tab:        { fr: "Aliments",                 en: "Foods" },
  new_meal:         { fr: "Nouveau repas",            en: "New meal" },
  edit_meal:        { fr: "Modifier le repas",        en: "Edit meal" },
  create_meal:      { fr: "Créer un repas",           en: "Create a meal" },
  no_custom_meals:  { fr: "Aucun repas enregistré — créez-en un pour loguer plusieurs aliments en un tap.",
                      en: "No saved meals yet — create one to log several foods in one tap." },
  meal_name:        { fr: "Nom du repas",             en: "Meal name" },
  meal_name_ph:     { fr: "ex. Mon petit-déj",        en: "e.g. My breakfast" },
  meal_ingredients: { fr: "Ingrédients",              en: "Ingredients" },
  meal_total:       { fr: "Total",                    en: "Total" },
  save_meal:        { fr: "Enregistrer le repas",     en: "Save meal" },
  save_as_meal:     { fr: "Enregistrer comme repas", en: "Save as a meal" },
  log_all:          { fr: "Tout enregistrer",         en: "Log all" },
  delete_meal:      { fr: "Supprimer",                en: "Delete" },
  add_item:         { fr: "Ajouter un aliment",       en: "Add a food" },

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
