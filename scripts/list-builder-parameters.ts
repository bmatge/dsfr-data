/**
 * Extrait automatiquement tous les paramètres configurables du Builder
 *
 * Ce script analyse le code du builder pour lister tous les éléments HTML
 * qui représentent des paramètres configurables.
 *
 * Usage : npx ts-node scripts/list-builder-parameters.ts
 */

import * as fs from 'fs';
import * as path from 'path';

interface Parameter {
  id: string;
  type: 'select' | 'input' | 'checkbox' | 'radio' | 'toggle' | 'button';
  category: string;
  label?: string;
  values?: string[];
  required?: boolean;
}

/**
 * Extrait les paramètres depuis le HTML du builder
 */
function extractParameters(htmlContent: string): Parameter[] {
  const parameters: Parameter[] = [];

  // Extraire tous les select
  const selectRegex = /<select[^>]*id="([^"]+)"[^>]*>(.*?)<\/select>/gs;
  let match;
  while ((match = selectRegex.exec(htmlContent)) !== null) {
    const id = match[1];
    const content = match[2];

    // Extraire les options
    const optionRegex = /<option[^>]*value="([^"]*)"[^>]*>([^<]+)<\/option>/g;
    const values: string[] = [];
    let optMatch;
    while ((optMatch = optionRegex.exec(content)) !== null) {
      if (optMatch[1]) values.push(optMatch[1]);
    }

    // Trouver le label associé
    const labelRegex = new RegExp(`<label[^>]*for="${id}"[^>]*>([^<]+)<`, 'i');
    const labelMatch = htmlContent.match(labelRegex);
    const label = labelMatch ? labelMatch[1].trim() : undefined;

    parameters.push({
      id,
      type: 'select',
      category: categorizeParameter(id),
      label,
      values: values.length > 0 ? values : undefined,
    });
  }

  // Extraire tous les input text/number
  const inputRegex = /<input[^>]*id="([^"]+)"[^>]*type="(text|number)"[^>]*>/g;
  while ((match = inputRegex.exec(htmlContent)) !== null) {
    const id = match[1];
    const inputType = match[2];

    const labelRegex = new RegExp(`<label[^>]*for="${id}"[^>]*>([^<]+)<`, 'i');
    const labelMatch = htmlContent.match(labelRegex);
    const label = labelMatch ? labelMatch[1].trim() : undefined;

    parameters.push({
      id,
      type: 'input',
      category: categorizeParameter(id),
      label,
    });
  }

  // Extraire tous les checkbox
  const checkboxRegex = /<input[^>]*type="checkbox"[^>]*id="([^"]+)"[^>]*>/g;
  while ((match = checkboxRegex.exec(htmlContent)) !== null) {
    const id = match[1];

    const labelRegex = new RegExp(`<label[^>]*for="${id}"[^>]*>([^<]+)<`, 'i');
    const labelMatch = htmlContent.match(labelRegex);
    const label = labelMatch ? labelMatch[1].trim() : undefined;

    const isToggle = htmlContent.includes(`class="fr-toggle__input" id="${id}"`);

    parameters.push({
      id,
      type: isToggle ? 'toggle' : 'checkbox',
      category: categorizeParameter(id),
      label,
    });
  }

  // Extraire tous les radio
  const radioRegex = /<input[^>]*type="radio"[^>]*id="([^"]+)"[^>]*name="([^"]+)"[^>]*>/g;
  const radioGroups = new Map<string, string[]>();
  while ((match = radioRegex.exec(htmlContent)) !== null) {
    const id = match[1];
    const name = match[2];

    if (!radioGroups.has(name)) {
      radioGroups.set(name, []);
    }
    radioGroups.get(name)!.push(id);
  }

  for (const [name, ids] of radioGroups.entries()) {
    parameters.push({
      id: name,
      type: 'radio',
      category: categorizeParameter(name),
      values: ids,
    });
  }

  // Extraire les boutons de type de graphique
  const chartTypeRegex = /<button[^>]*data-type="([^"]+)"[^>]*>/g;
  const chartTypes: string[] = [];
  while ((match = chartTypeRegex.exec(htmlContent)) !== null) {
    chartTypes.push(match[1]);
  }

  if (chartTypes.length > 0) {
    parameters.push({
      id: 'chart-type',
      type: 'button',
      category: 'Type de graphique',
      values: chartTypes,
    });
  }

  return parameters;
}

/**
 * Catégorise un paramètre selon son ID
 */
function categorizeParameter(id: string): string {
  if (id.includes('source') || id.includes('saved')) return '1. Source de données';
  if (id.includes('generation-mode') || id.includes('refresh')) return '2. Mode de génération';
  if (id.includes('normalize')) return '3. Nettoyage des données';
  if (id.includes('facets')) return '4. Filtres à facettes';
  if (id.includes('chart-type')) return '5. Type de graphique';
  if (
    id.includes('field') ||
    id.includes('aggregation') ||
    id.includes('sort') ||
    id.includes('query') ||
    id.includes('datalist')
  )
    return '6. Configuration des données';
  if (id.includes('title') || id.includes('subtitle') || id.includes('palette') || id.includes('kpi'))
    return '7. Apparence';
  if (id.includes('a11y')) return '8. Accessibilité';
  return '9. Autres';
}

/**
 * Génère un rapport Markdown
 */
function generateMarkdownReport(parameters: Parameter[]): string {
  let md = '# Paramètres du Builder\n\n';
  md += `> Généré automatiquement le ${new Date().toLocaleString('fr-FR')}\n\n`;

  // Grouper par catégorie
  const categories = new Map<string, Parameter[]>();
  for (const param of parameters) {
    if (!categories.has(param.category)) {
      categories.set(param.category, []);
    }
    categories.get(param.category)!.push(param);
  }

  // Trier les catégories
  const sortedCategories = Array.from(categories.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  // Générer le tableau par catégorie
  for (const [category, params] of sortedCategories) {
    md += `## ${category}\n\n`;
    md += '| ID | Type | Label | Valeurs possibles |\n';
    md += '|----|------|-------|-------------------|\n';

    for (const param of params) {
      const values = param.values ? param.values.join(', ') : '—';
      const label = param.label || '—';
      md += `| \`${param.id}\` | ${param.type} | ${label} | ${values} |\n`;
    }

    md += '\n';
  }

  // Statistiques
  md += '## Statistiques\n\n';
  md += `- **Total de paramètres** : ${parameters.length}\n`;
  md += `- **Catégories** : ${categories.size}\n\n`;

  // Détail par type
  const typeCount = new Map<string, number>();
  for (const param of parameters) {
    typeCount.set(param.type, (typeCount.get(param.type) || 0) + 1);
  }

  md += '### Par type\n\n';
  for (const [type, count] of Array.from(typeCount.entries()).sort((a, b) => b[1] - a[1])) {
    md += `- **${type}** : ${count}\n`;
  }

  return md;
}

/**
 * Fonction principale
 */
function main() {
  const builderHtmlPath = path.join(
    __dirname,
    '../apps/builder/index.html'
  );

  console.log('📖 Lecture du fichier builder HTML...');
  const htmlContent = fs.readFileSync(builderHtmlPath, 'utf-8');

  console.log('🔍 Extraction des paramètres...');
  const parameters = extractParameters(htmlContent);

  console.log(`✅ ${parameters.length} paramètres trouvés\n`);

  // Générer le rapport
  const report = generateMarkdownReport(parameters);

  // Écrire le rapport
  const outputPath = path.join(__dirname, '../tests/builder-e2e/PARAMETERS_LIST.md');
  fs.writeFileSync(outputPath, report, 'utf-8');

  console.log(`📄 Rapport généré : ${outputPath}\n`);

  // Afficher un résumé
  console.log('=== RÉSUMÉ ===\n');
  const categories = new Map<string, number>();
  for (const param of parameters) {
    categories.set(param.category, (categories.get(param.category) || 0) + 1);
  }

  for (const [category, count] of Array.from(categories.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )) {
    console.log(`${category}: ${count} paramètres`);
  }

  console.log(`\nTotal: ${parameters.length} paramètres configurables`);
}

// Exécuter
if (require.main === module) {
  main();
}
