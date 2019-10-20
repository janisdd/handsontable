import BasePlugin from './../_base';
import { registerPlugin } from './../../plugins';
import { isObject } from './../../helpers/object';
import { rangeEach } from './../../helpers/number';
import { isUndefined } from './../../helpers/mixed';

const DEFAULT_SEARCH_RESULT_CLASS = 'htSearchResult';

const DEFAULT_SUSPENDED_SEARCH_RESULT_CLASS = 'htSuspendedSearchResult';

const DEFAULT_CALLBACK = function(instance, row, col, data, testResult) {
  instance.getCellMeta(row, col).isSearchResult = testResult;
};

const DEFAULT_QUERY_METHOD = function(query, value) {
  if (isUndefined(query) || query === null || !query.toLowerCase || query.length === 0) {
    return false;
  }
  if (isUndefined(value) || value === null) {
    return false;
  }

  return value.toString().toLowerCase().indexOf(query.toLowerCase()) !== -1;
};

/**
 * @plugin Search
 *
 * @description
 * The search plugin provides an easy interface to search data across Handsontable.
 *
 * In order to enable search mechanism, {@link Options#search} option must be set to `true`.
 *
 * @example
 * ```js
 * // as boolean
 * search: true
 * // as a object with one or more options
 * search: {
 *   callback: myNewCallbackFunction,
 *   queryMethod: myNewQueryMethod,
 *   searchResultClass: 'customClass'
 * }
 *
 * // Access to search plugin instance:
 * const searchPlugin = hot.getPlugin('search');
 *
 * // Set callback programmatically:
 * searchPlugin.setCallback(myNewCallbackFunction);
 * // Set query method programmatically:
 * searchPlugin.setQueryMethod(myNewQueryMethod);
 * // Set search result cells class programmatically:
 * searchPlugin.setSearchResultClass(customClass);
 * ```
 */
class Search extends BasePlugin {
  constructor(hotInstance) {
    super(hotInstance);
    /**
     * Function called during querying for each cell from the {@link DataMap}.
     *
     * @private
     * @type {Function}
     */
    this.callback = DEFAULT_CALLBACK;
    /**
     * Query function is responsible for determining whether a query matches the value stored in a cell.
     *
     * @private
     * @type {Function}
     */
    this.queryMethod = DEFAULT_QUERY_METHOD;
    /**
     * Class name added to each cell that belongs to the searched query.
     *
     * @private
     * @type {String}
     */
    this.searchResultClass = DEFAULT_SEARCH_RESULT_CLASS;

    /**
     * Class name to exchange for {@link searchResultClass} when the search is suspended
     * @type {string}
     */
    this.suspendedSearchResultClass = DEFAULT_SUSPENDED_SEARCH_RESULT_CLASS

    /**
     * true: the search is suspended and we use {@link suspendedSearchResultClass} for results,
     * false: the search is active and we use {@link searchResultClass} for results
     * @type {boolean}
     */
    this.isSuspended = false
  }

  /**
   * Checks if the plugin is enabled in the handsontable settings. This method is executed in {@link Hooks#beforeInit}
   * hook and if it returns `true` than the {@link AutoRowSize#enablePlugin} method is called.
   *
   * @returns {Boolean}
   */
  isEnabled() {
    return this.hot.getSettings().search;
  }

  /**
   * Enables the plugin functionality for this Handsontable instance.
   */
  enablePlugin() {
    if (this.enabled) {
      return;
    }

    const searchSettings = this.hot.getSettings().search;
    this.updatePluginSettings(searchSettings);

    this.addHook('beforeRenderer', (...args) => this.onBeforeRenderer(...args));

    super.enablePlugin();
  }

  /**
   * Disables the plugin functionality for this Handsontable instance.
   */
  disablePlugin() {
    const beforeRendererCallback = (...args) => this.onBeforeRenderer(...args);

    this.hot.addHook('beforeRenderer', beforeRendererCallback);
    this.hot.addHookOnce('afterRender', () => {
      this.hot.removeHook('beforeRenderer', beforeRendererCallback);
    });

    super.disablePlugin();
  }

  /**
   * Updates the plugin state. This method is executed when {@link Core#updateSettings} is invoked.
   * Can be call to force the plugin to update?
   */
  updatePlugin() {
    this.disablePlugin();
    this.enablePlugin();

    super.updatePlugin();
  }

  /**
   * Makes the query.
   *
   * @param {String} queryStr Value to be search.
   * @param {Function} [callback] Callback function performed on cells with values which matches to the searched query.
   * @param {Function} [queryMethod] Query function responsible for determining whether a query matches the value stored in a cell.
   * @returns {{row: number, col: number, data: string | null | undefined}[]} Return an array of objects with `row`, `col`, `data` properties or empty array.
   */
  query(queryStr, callback = this.getCallback(), queryMethod = this.getQueryMethod()) {
    const rowCount = this.hot.countRows();
    const colCount = this.hot.countCols();
    const queryResult = [];
    const instance = this.hot;

    rangeEach(0, rowCount - 1, (rowIndex) => {
      rangeEach(0, colCount - 1, (colIndex) => {
        const cellData = this.hot.getDataAtCell(rowIndex, colIndex);
        const cellProperties = this.hot.getCellMeta(rowIndex, colIndex);
        const cellCallback = cellProperties.search.callback || callback;
        const cellQueryMethod = cellProperties.search.queryMethod || queryMethod;
        const testResult = cellQueryMethod(queryStr, cellData);

        if (testResult) {
          const singleResult = {
            row: rowIndex,
            col: colIndex,
            data: cellData,
          };

          queryResult.push(singleResult);
        }

        if (cellCallback) {
          cellCallback(instance, rowIndex, colIndex, cellData, testResult);
        }
      });
    });

    return queryResult;
  }

  /**
   * Makes the async query.
   *
   * @param {String} queryStr Value to be search.
   * @param progressEveryXPercent
   * @param {Function} progressCallback called when we processed a cell, arg[0] = index, arg[1] = max index, arg[2] = percentage, result = void
   * @param {{isCancellationRequested: boolean}} cancelToken
   * @param {Function} [callback] Callback function performed on cells with values which matches to the searched query.
   * @param {Function} [queryMethod] Query function responsible for determining whether a query matches the value stored in a cell.
   * @returns {Promise<{row: number, col: number, data: string | null | undefined}[]>} Return an array of objects with `row`, `col`, `data` properties or empty array.
   */
  queryAsync(queryStr, progressCallback, progressEveryXPercent = 1, cancelToken, callback = this.getCallback(), queryMethod = this.getQueryMethod()) {

    return new Promise((resolve) => {
      // start a new macro task
      setTimeout(() => {
        const queryResult = []
        this._queryAsync(queryStr, progressCallback, progressEveryXPercent, progressEveryXPercent, 0, 0, queryResult, cancelToken, callback, queryMethod)
          .then(() => {
            resolve(queryResult)
          })
      }, 0)
    })
  }

  _queryAsync(queryStr, progressCallback, progressEveryXPercent = 1, progressPercentageStopAt,
              startRowIndex, startColIndex, queryResult, cancelToken = null, callback = this.getCallback(), queryMethod = this.getQueryMethod()) {

    return new Promise((resolve) => {
      const rowCount = this.hot.countRows();
      const colCount = this.hot.countCols();
      const instance = this.hot;

      let percentage = 0;
      let count = -1
      const maxCount = rowCount * colCount

      let percentageStepped = false
      let firstIter = true
      let isCancellationRequested = false

      let rowIndex = startRowIndex
      let colIndex = startColIndex

      for (; rowIndex < rowCount; rowIndex++) {

        if (firstIter) {
          colIndex = startColIndex
          firstIter = false
        } else {
          colIndex = 0
        }

        for (; colIndex < colCount; colIndex++) {

          // do the break here not at the bottom of the loop because we incremented vars here
          if (percentageStepped) break

          const cellData = this.hot.getDataAtCell(rowIndex, colIndex)
          const cellProperties = this.hot.getCellMeta(rowIndex, colIndex)
          const cellCallback = cellProperties.search.callback || callback
          const cellQueryMethod = cellProperties.search.queryMethod || queryMethod
          const testResult = cellQueryMethod(queryStr, cellData)

          if (testResult) {
            const singleResult = {
              row: rowIndex,
              col: colIndex,
              data: cellData,
            };

            queryResult.push(singleResult)
          }

          if (cellCallback) {
            cellCallback(instance, rowIndex, colIndex, cellData, testResult)
          }

          count = (rowIndex * colCount) + (colIndex + 1)
          percentage = count * 100 / maxCount

          // check if query was cancelled

          if (cancelToken && cancelToken.isCancellationRequested) {
            isCancellationRequested = true
            break
          }

          if (percentage - progressPercentageStopAt >= 0) {

            percentageStepped = true
          }
        }

        if (isCancellationRequested) break

        // if the inner look broke before colCount then the outer look must not be proceed
        // e.g. outer loop: 0 to inclusive 2, inner loop: 0 to inclusive 2 and we break on outer 0, inner 1
        //    then we want to start the next recursive call at outer 0, inner 2

        // but if the inner look broke because/on colIndex === colCount
        // e.g. outer loop: 0 to inclusive 2, inner loop: 0 to inclusive 2 and we break on outer 0, inner 2
        //    then we need to proceed the outer look by 1 so we get in the recursive call outer 1, inner 0

        if (percentageStepped) {

          if (colIndex === colCount) {
            colIndex = 0
            // eslint-disable-next-line no-plusplus
            rowIndex++
          }
          break
        }

        // what if we break at the last (outer + inner) iteration? ... see below
      }

      if (isCancellationRequested) {
        queryResult = []
        resolve()
        return
      }

      if (percentageStepped) {

        // update ui
        progressCallback(count, maxCount, percentage)

        // what if we break at the last iteration?
        // e.g. outer loop: 0 to inclusive 2, inner loop: 0 to inclusive 2 and we break here at outer: 2, inner 2
        //    then we set outer to 3, inner to 0 BUT we should abort recursion...

        if (rowIndex === rowCount) {
          resolve()
          return
        }

        // ui won't update when we further iterate in this macro task...
        // start a new macro task and let the browser repaint the ui
        setTimeout(() => {
          this._queryAsync(queryStr, progressCallback, progressEveryXPercent, progressPercentageStopAt + progressEveryXPercent,
            rowIndex, colIndex, queryResult, cancelToken, callback, queryMethod)
            .then(() => {
              resolve()
            })
        }, 0)

        return
      }

      // e.g. items count = 10, progressEveryXPercent = 101 then the ui is never updated but this is ok (progressEveryXPercent should be in [0, 100])
      return resolve()
    })
  }

  /**
   * Gets the callback function.
   *
   * @returns {Function} Return the callback function.
   */
  getCallback() {
    return this.callback;
  }

  /**
   * Sets the callback function. This function will be called during querying for each cell.
   *
   * @param {Function} newCallback
   */
  setCallback(newCallback) {
    this.callback = newCallback;
  }

  /**
   * Gets the query method function.
   *
   * @returns {Function} Return the query method.
   */
  getQueryMethod() {
    return this.queryMethod;
  }

  /**
   * Sets the query method function. The function is responsible for determining whether a query matches the value stored in a cell.
   *
   * @param {Function} newQueryMethod
   */
  setQueryMethod(newQueryMethod) {
    this.queryMethod = newQueryMethod;
  }

  /**
   * Gets search result cells class name.
   *
   * @returns {String} Return the cell class name.
   */
  getSearchResultClass() {
    return this.searchResultClass;
  }

  /**
   * Sets search result cells class name. This class name will be added to each cell that belongs to the searched query.
   *
   * @param {String} newElementClass
   */
  setSearchResultClass(newElementClass) {
    this.searchResultClass = newElementClass;
  }

  /**
   * Gets the suspended search result cell class name
   * @return {string}
   */
  getSuspendedSearchResultClass() {
    return this.suspendedSearchResultClass
  }

  /**
   * Sets suspended search result cells class name. This class name will be exchanged for {@link suspendedSearchResultClass} to each cell that belongs to the searched query.
   * @param newElementClass
   */
  setSuspendedSearchResultClass(newElementClass) {
    this.suspendedSearchResultClass = newElementClass
  }

  /**
   * Gets if the search is suspended
   * @return {boolean}
   */
  getIsSuspended() {
    return this.isSuspended
  }

  /**
   * Sets if the search is suspended (update is needed after this)
   * @param isSuspended
   */
  setIsSuspended(isSuspended) {
    this.isSuspended = isSuspended
  }

  /**
   * Updates the settings of the plugin.
   *
   * @param {Object} searchSettings The plugin settings, taken from Handsontable configuration.
   * @private
   */
  updatePluginSettings(searchSettings) {
    if (isObject(searchSettings)) {
      if (searchSettings.searchResultClass) {
        this.setSearchResultClass(searchSettings.searchResultClass);
      }

      if (searchSettings.queryMethod) {
        this.setQueryMethod(searchSettings.queryMethod);
      }

      if (searchSettings.callback) {
        this.setCallback(searchSettings.callback);
      }

      if (searchSettings.suspendedSearchResultClass) {
        this.setSuspendedSearchResultClass(searchSettings.suspendedSearchResultClass)
      }

      if (isUndefined(searchSettings.isSuspended) === false) {
        this.setIsSuspended(searchSettings.isSuspended)
      }
    }
  }

  /** *
   * The `beforeRenderer` hook callback.
   *
   * @private
   * @param {HTMLTableCellElement} TD The rendered `TD` element.
   * @param {Number} row Visual row index.
   * @param {Number} col Visual column index.
   * @param {String | Number} prop Column property name or a column index, if datasource is an array of arrays.
   * @param {String} value Value of the rendered cell.
   * @param {Object} cellProperties Object containing the cell's properties.
   */
  onBeforeRenderer(TD, row, col, prop, value, cellProperties) {

    const className = cellProperties.className || [];
    let classArray = [];

    if (typeof className === 'string') {
      classArray = className.split(' ');

    } else {
      classArray.push(...className);
    }

    if (this.isEnabled() && cellProperties.isSearchResult) {

      const searchResultClassIndex = classArray.indexOf(this.searchResultClass)
      const suspendedSearchResultClassIndex = classArray.indexOf(this.suspendedSearchResultClass)

      // because we don't know the prior state before suspend we just clear both, then re-add

      if (searchResultClassIndex !== -1) {
        classArray.splice(searchResultClassIndex, 1);
      }

      if (suspendedSearchResultClassIndex !== -1) {
        classArray.splice(suspendedSearchResultClassIndex, 1);
      }

      if (this.isSuspended) {
        classArray.push(`${this.suspendedSearchResultClass}`);
      } else {
        classArray.push(`${this.searchResultClass}`);
      }

    } else {

      if (classArray.includes(this.searchResultClass)) {
        classArray.splice(classArray.indexOf(this.searchResultClass), 1);
      }

      if (classArray.includes(this.suspendedSearchResultClass)) {
        classArray.splice(classArray.indexOf(this.suspendedSearchResultClass), 1);
      }

    }

    cellProperties.className = classArray.join(' ');
  }

  /**
   * Destroys the plugin instance.
   */
  destroy() {
    super.destroy();
  }
}

registerPlugin('search', Search);

export default Search;
