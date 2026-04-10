/**
 * Shared completion evaluator — single source of truth for specimen completion.
 *
 * Pure-function module with no Node or DOM dependencies so it can be loaded
 * in both the renderer (<script> tag) and the backend (require()).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();          // Node / backend
  } else {
    root.CompletionEvaluator = factory(); // Browser / renderer
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Evaluate whether a specimen's review is complete.
   *
   * @param {Object} specState            Per-specimen in-progress state
   * @param {string[]} promptFieldSchema  Canonical field list from the project
   * @param {Array<{name:string, fields:string[]}>} categories  Category objects
   * @returns {{
   *   isComplete: boolean,
   *   resolvedFields: number,
   *   totalFields: number,
   *   unconfirmedFields: number,
   *   confirmedCategories: number,
   *   totalCategories: number,
   *   allCategoriesConfirmed: boolean,
   *   incompleteReasons: string[]
   * }}
   */
  function evaluateCompletion(specState, promptFieldSchema, categories) {
    const totalFields = promptFieldSchema.length;
    const resolvedFields = Object.keys((specState && specState.accepted_fields) || {}).length;
    const unconfirmedFields = Object.keys((specState && specState.unconfirmed_fields) || {}).length;
    const confirmedCats = (specState && specState.categories_confirmed) || [];

    const allCategoriesConfirmed = categories.length > 0 &&
      categories.every(function (c) { return confirmedCats.indexOf(c.name) !== -1; });

    const incompleteReasons = [];
    if (resolvedFields < totalFields) {
      incompleteReasons.push(resolvedFields + '/' + totalFields + ' fields resolved');
    }
    if (unconfirmedFields > 0) {
      incompleteReasons.push(unconfirmedFields + ' unconfirmed fields remaining');
    }

    return {
      isComplete: resolvedFields >= totalFields && unconfirmedFields === 0,
      resolvedFields: resolvedFields,
      totalFields: totalFields,
      unconfirmedFields: unconfirmedFields,
      confirmedCategories: confirmedCats.length,
      totalCategories: categories.length,
      allCategoriesConfirmed: allCategoriesConfirmed,
      incompleteReasons: incompleteReasons,
    };
  }

  return { evaluateCompletion: evaluateCompletion };
});
