/* eslint-disable import/prefer-default-export */

import { DO_NOT_SWAP, getCompareFunctionFactory } from './sortService';

/**
 * Sort comparator handled by conventional sort algorithm.
 *
 * @param {Array} sortOrders Sort orders (`asc` for ascending, `desc` for descending).
 * @param {Array} columnMetas Column meta objects.
 * @param {Array} sortColumnIndices the indices of the columns to sort (indices inside sortOrders)
 * @returns {Function}
 */
export function rootComparator(sortingOrders, columnMetas, sortColumnIndices) {
  return function(rowIndexWithValues, nextRowIndexWithValues) {
    // We sort array of arrays. Single array is in form [rowIndex, ...values].
    // We compare just values, stored at second index of array.
    const [, ...values] = rowIndexWithValues;
    const [, ...nextValues] = nextRowIndexWithValues;

    return (function getCompareResult() {

      let column = 0;
      let compareResult;
      do {
        const sortingOrder = sortingOrders[column];
        const columnMeta = columnMetas[column];
        const value = values[column];
        const nextValue = nextValues[column];
        const pluginSettings = columnMeta.columnSorting;
        const compareFunctionFactory = pluginSettings.compareFunctionFactory ? pluginSettings.compareFunctionFactory : getCompareFunctionFactory(columnMeta.type);
        compareResult = compareFunctionFactory(sortingOrder, columnMeta, pluginSettings)(value, nextValue);
        // eslint-disable-next-line no-plusplus
        column++;

        // we only need to check the next column if both values are the same (then we sub-sort)
      } while (column < sortColumnIndices.length && compareResult === DO_NOT_SWAP);

      // DIFF - MultiColumnSorting & ColumnSorting: removed iteration through next sorted columns.

      return compareResult;
    }());
  };
}

// ------------- old --------------
// /**
//  * Sort comparator handled by conventional sort algorithm.
//  *
//  * @param {Array} sortOrders Sort orders (`asc` for ascending, `desc` for descending).
//  * @param {Array} columnMetas Column meta objects.
//  * @returns {Function}
//  */
// export function rootComparator(sortingOrders, columnMetas) {
//   return function(rowIndexWithValues, nextRowIndexWithValues) {
//     // We sort array of arrays. Single array is in form [rowIndex, ...values].
//     // We compare just values, stored at second index of array.
//     const [, ...values] = rowIndexWithValues;
//     const [, ...nextValues] = nextRowIndexWithValues;
//
//     return (function getCompareResult(column) {
//       const sortingOrder = sortingOrders[column];
//       const columnMeta = columnMetas[column];
//       const value = values[column];
//       const nextValue = nextValues[column];
//       const pluginSettings = columnMeta.columnSorting;
//       const compareFunctionFactory = pluginSettings.compareFunctionFactory ? pluginSettings.compareFunctionFactory : getCompareFunctionFactory(columnMeta.type);
//       const compareResult = compareFunctionFactory(sortingOrder, columnMeta, pluginSettings)(value, nextValue);
//
//       // DIFF - MultiColumnSorting & ColumnSorting: removed iteration through next sorted columns.
//
//       return compareResult;
//     }(0));
//   };
// }
