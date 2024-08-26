import BasePlugin from './../_base';
import Hooks from './../../pluginHooks';
import { offset, outerHeight, outerWidth } from './../../helpers/dom/element';
import EventManager from './../../eventManager';
import { registerPlugin } from './../../plugins';
import { CellCoords } from './../../3rdparty/walkontable/src';
import { getDeltas, getDragDirectionAndRange, DIRECTIONS, getMappedFillHandleSetting } from './utils';

Hooks.getSingleton().register('modifyAutofillRange');
Hooks.getSingleton().register('beforeAutofill');

const INSERT_ROW_ALTER_ACTION_NAME = 'insert_row';
const INTERVAL_FOR_ADDING_ROW = 200;

/**
 * This plugin provides "drag-down" and "copy-down" functionalities, both operated using the small square in the right
 * bottom of the cell selection.
 *
 * "Drag-down" expands the value of the selected cells to the neighbouring cells when you drag the small square in the corner.
 *
 * "Copy-down" copies the value of the selection to all empty cells below when you double click the small square.
 *
 * @class Autofill
 * @plugin Autofill
 */

class Autofill extends BasePlugin {
  constructor(hotInstance) {
    super(hotInstance);
    /**
     * Event manager instance.
     *
     * @private
     * @type {EventManager}
     */
    this.eventManager = new EventManager(this);
    /**
     * Specifies if adding new row started.
     *
     * @private
     * @type {Boolean}
     */
    this.addingStarted = false;

    /**
     * the function used to fill data
     *
     * if a function is set, the returned fill data must be of size targetCount!
     * @type {null | (data: string[], targetCount: number, isNormalDirection: bool, mouseupEvent: MouseEvent) => string[]}
     */
    this.fillFunc = null;
    /**
     * Specifies if there was mouse down on the cell corner.
     *
     * @private
     * @type {Boolean}
     */
    this.mouseDownOnCellCorner = false;
    /**
     * Specifies if mouse was dragged outside Handsontable.
     *
     * @private
     * @type {Boolean}
     */
    this.mouseDragOutside = false;
    /**
     * Specifies how many cell levels were dragged using the handle.
     *
     * @private
     * @type {Boolean}
     */
    this.handleDraggedCells = 0;
    /**
     * Specifies allowed directions of drag (`'horizontal'` or '`vertical`').
     *
     * @private
     * @type {String[]}
     */
    this.directions = [];
    /**
     * Specifies if can insert new rows if needed.
     *
     * @type {Boolean}
     */
    this.autoInsertRow = false;
  }

  /**
   * Checks if the plugin is enabled in the Handsontable settings.
   *
   * @returns {Boolean}
   */
  isEnabled() {
    return this.hot.getSettings().fillHandle;
  }

  /**
   * Enables the plugin functionality for this Handsontable instance.
   */
  enablePlugin() {
    if (this.enabled) {
      return;
    }

    this.mapSettings();
    this.registerEvents();

    this.addHook('afterOnCellCornerMouseDown', event => this.onAfterCellCornerMouseDown(event));
    this.addHook('afterOnCellCornerDblClick', event => this.onCellCornerDblClick(event));
    this.addHook('beforeOnCellMouseOver', (event, coords) => this.onBeforeCellMouseOver(coords));

    super.enablePlugin();
  }

  /**
   * Updates the plugin state. This method is executed when {@link Core#updateSettings} is invoked.
   */
  updatePlugin() {
    this.disablePlugin();
    this.enablePlugin();
    super.updatePlugin();
  }

  /**
   * Disables the plugin functionality for this Handsontable instance.
   */
  disablePlugin() {
    this.clearMappedSettings();
    super.disablePlugin();
  }

  /**
   * sets the function to fill data
   * @param fillFunc
   */
  setFillFunction(fillFunc) {
    this.fillFunc = fillFunc;
  }

  /**
   * Gets selection data
   *
   * @private
   * @returns {Array} Array with the data.
   */
  getSelectionData() {
    const selRange = {
      from: this.hot.getSelectedRangeLast().from,
      to: this.hot.getSelectedRangeLast().to,
    };

    return this.hot.getData(selRange.from.row, selRange.from.col, selRange.to.row, selRange.to.col);
  }

  /**
   * Try to apply fill values to the area in fill border, omitting the selection border.
   *
   * @private
   * @param {MouseEvent} event `mouseup` event properties.
   * @returns {Boolean} reports if fill was applied.
   *
   * @fires Hooks#modifyAutofillRange
   * @fires Hooks#beforeAutofill
   */
  fillIn(event) {
    if (this.hot.selection.highlight.getFill().isEmpty()) {
      return false;
    }

    let cornersOfSelectionAndDragAreas = this.hot.selection.highlight.getFill().getCorners();

    this.resetSelectionOfDraggedArea();

    const cornersOfSelectedCells = this.getCornersOfSelectedCells();
    cornersOfSelectionAndDragAreas = this.hot.runHooks('modifyAutofillRange', cornersOfSelectionAndDragAreas, cornersOfSelectedCells);

    const { directionOfDrag, startOfDragCoords, endOfDragCoords } = getDragDirectionAndRange(cornersOfSelectedCells, cornersOfSelectionAndDragAreas);

    if (startOfDragCoords && startOfDragCoords.row > -1 && startOfDragCoords.col > -1) {
      let selectionData = this.getSelectionData();
      // shallow copy does not work because array of arrays...
      const selectionDataCopy = this.getSelectionData();

      this.hot.runHooks('beforeAutofill', startOfDragCoords, endOfDragCoords, selectionData);

      const deltas = getDeltas(startOfDragCoords, endOfDragCoords, selectionData, directionOfDrag);
      let fillData = selectionData;

      const isFillColumn = directionOfDrag === 'down' || directionOfDrag === 'up';
      let autoFillFailed = false;
      // normal is top to bottom or left to right
      // however, the user can also drag to top or to left (not normal), this is important for interpolation
      // for copy only, this can be ignored!
      const isNormalDirection = directionOfDrag === 'down' || directionOfDrag === 'right';

      let dragLength = 0;

      if (this.fillFunc) {
        // if not custom fill, just use the selection data
        // without custom fill, we don't want to modify fillData or selectionData (else populateFromArray doesn't work)

        if (isFillColumn) {
          dragLength = endOfDragCoords.row - startOfDragCoords.row + 1;
          // fill columns (vertical)
          const len = selectionData.length;
          const numColumns = selectionData[0].length;
          // every column data as an array

          while (dragLength > fillData.length) {
            fillData.push(Array(numColumns).fill(''));
          }

          for (let _col = 0; _col < numColumns; _col++) {
            const _fillData = [];
            for (let _row = 0; _row < len; _row++) {
              _fillData.push(selectionData[_row][_col]);
            }

            const _preFillData = this._fillSingleLine(_fillData, dragLength, isNormalDirection, event);

            if (_preFillData) {

              if (_preFillData.length === dragLength) {

                if (fillData.length > dragLength) {
                  // remove entries that are not needed from the ending
                  fillData.splice(dragLength);
                }
              }

              // auto fill data is less than we selected
              for (let _row = 0; _row < dragLength; _row++) {
                fillData[_row][_col] = _preFillData[_row];
              }

            } else {
              autoFillFailed = true;
            }
          }

        } else {
          // fill rows (horizontal)
          dragLength = endOfDragCoords.col - startOfDragCoords.col + 1;
          const len = selectionData[0].length;
          const numRows = selectionData.length;
          // every row data as an array

          if (dragLength > len) {
            for (let i = 0; i < numRows; i++) {
              fillData[i].push(...Array(dragLength - len).fill(''));
            }
          }

          for (let _row = 0; _row < numRows; _row++) {
            const _fillData = [];

            for (let _col = 0; _col < len; _col++) {
              _fillData.push(selectionData[_row][_col]);
            }

            const _preFillData = this._fillSingleLine(_fillData, dragLength, isNormalDirection, event);

            if (_preFillData) {

              if (_preFillData.length === dragLength) {
                // just use fill data
                fillData[_row] = _preFillData;
              } else {
                // auto fill data is less than we selected
                for (let _col = 0; _col < dragLength; _col++) {
                  fillData[_row][_col] = _preFillData[_col];
                }
              }

            } else {
              autoFillFailed = true;
            }
          }
        }
      }

      if (autoFillFailed) {
        // do normal fill (copy)
        fillData = selectionDataCopy;
        selectionData = [...selectionDataCopy];
      }

      // this seems to work because fillData = selectionData and we modified it in place
      if (['up', 'left'].indexOf(directionOfDrag) > -1) {
        fillData = [];
        let fillOffset = null;

        if (directionOfDrag === 'up') {
          fillOffset = dragLength % selectionData.length;

          for (let i = 0; i < dragLength; i++) {
            fillData.push(selectionData[(i + (selectionData.length - fillOffset)) % selectionData.length]);
          }

        } else {
          fillOffset = dragLength % selectionData[0].length;

          for (let i = 0; i < selectionData.length; i++) {
            fillData.push([]);
            for (let j = 0; j < dragLength; j++) {
              fillData[i].push(selectionData[i][(j + (selectionData[i].length - fillOffset)) % selectionData[i].length]);
            }
          }
        }
      }

      this.hot.populateFromArray(
        startOfDragCoords.row,
        startOfDragCoords.col,
        fillData,
        endOfDragCoords.row,
        endOfDragCoords.col,
        `${this.pluginName}.fill`,
        null,
        directionOfDrag,
        deltas // only important if cell value is numeric
      );

      this.setSelection(cornersOfSelectionAndDragAreas);

    } else {
      // reset to avoid some range bug
      this.hot._refreshBorders();
    }

    return true;
  }

  /**
   *
   * @param {Array<any>} data
   * @param {number} targetCount
   * @param {boolean} isNormalDirection normal is top to bottom or left to right
   *   however, the user can also drag to top or to left (not normal), this is important for interpolation
   *   for copy only, this can be ignored!
   * @private
   * @return {Array<any>} filled line data
   */
  _fillSingleLine(data, targetCount, isNormalDirection, event) {
    if (!this.fillFunc) return data;

    const fillData = this.fillFunc(data, targetCount, isNormalDirection, event);

    if (!fillData || !Array.isArray(fillData) || fillData.length !== targetCount) {
      return null;
    }

    return fillData;
  }

  /**
   * Reduces the selection area if the handle was dragged outside of the table or on headers.
   *
   * @private
   * @param {CellCoords} coords indexes of selection corners.
   * @returns {CellCoords}
   */
  reduceSelectionAreaIfNeeded(coords) {
    if (coords.row < 0) {
      coords.row = 0;
    }

    if (coords.col < 0) {
      coords.col = 0;
    }
    return coords;
  }

  /**
   * Gets the coordinates of the drag & drop borders.
   *
   * @private
   * @param {CellCoords} coordsOfSelection `CellCoords` coord object.
   * @returns {Array}
   */
  getCoordsOfDragAndDropBorders(coordsOfSelection) {
    const topLeftCorner = this.hot.getSelectedRangeLast().getTopLeftCorner();
    const bottomRightCorner = this.hot.getSelectedRangeLast().getBottomRightCorner();
    let coords;

    if (this.directions.includes(DIRECTIONS.vertical) &&
      (bottomRightCorner.row < coordsOfSelection.row || topLeftCorner.row > coordsOfSelection.row)) {
      coords = new CellCoords(coordsOfSelection.row, bottomRightCorner.col);

    } else if (this.directions.includes(DIRECTIONS.horizontal)) {
      coords = new CellCoords(bottomRightCorner.row, coordsOfSelection.col);

    } else {
      // wrong direction
      return;
    }

    return this.reduceSelectionAreaIfNeeded(coords);
  }

  /**
   * Show the fill border.
   *
   * @private
   * @param {CellCoords} coordsOfSelection `CellCoords` coord object.
   */
  showBorder(coordsOfSelection) {
    const coordsOfDragAndDropBorders = this.getCoordsOfDragAndDropBorders(coordsOfSelection);

    if (coordsOfDragAndDropBorders) {
      this.redrawBorders(coordsOfDragAndDropBorders);
    }
  }

  /**
   * Add new row
   *
   * @private
   */
  addRow() {
    this.hot._registerTimeout(setTimeout(() => {
      this.hot.alter(INSERT_ROW_ALTER_ACTION_NAME, void 0, 1, `${this.pluginName}.fill`);

      this.addingStarted = false;
    }, INTERVAL_FOR_ADDING_ROW));
  }

  /**
   * Add new rows if they are needed to continue auto-filling values.
   *
   * @private
   */
  addNewRowIfNeeded() {
    if (this.hot.selection.highlight.getFill().cellRange && this.addingStarted === false && this.autoInsertRow) {
      const cornersOfSelectedCells = this.hot.getSelectedLast();
      const cornersOfSelectedDragArea = this.hot.selection.highlight.getFill().getCorners();
      const nrOfTableRows = this.hot.countRows();

      if (cornersOfSelectedCells[2] < nrOfTableRows - 1 && cornersOfSelectedDragArea[2] === nrOfTableRows - 1) {
        this.addingStarted = true;

        this.addRow();
      }
    }
  }

  /**
   * Get corners of selected cells.
   *
   * @private
   * @returns {Array}
   */
  getCornersOfSelectedCells() {
    if (this.hot.selection.isMultiple()) {
      return this.hot.selection.highlight.createOrGetArea().getCorners();

    }
    return this.hot.selection.highlight.getCell().getCorners();

  }

  /**
   * Get index of last adjacent filled in row
   *
   * @private
   * @param {Array} cornersOfSelectedCells indexes of selection corners.
   * @returns {Number} gives number greater than or equal to zero when selection adjacent can be applied.
   * or -1 when selection adjacent can't be applied
   */
  getIndexOfLastAdjacentFilledInRow(cornersOfSelectedCells) {
    const data = this.hot.getData();
    const nrOfTableRows = this.hot.countRows();
    let lastFilledInRowIndex;

    for (let rowIndex = cornersOfSelectedCells[2] + 1; rowIndex < nrOfTableRows; rowIndex++) {
      for (let columnIndex = cornersOfSelectedCells[1]; columnIndex <= cornersOfSelectedCells[3]; columnIndex++) {
        const dataInCell = data[rowIndex][columnIndex];

        if (dataInCell) {
          return -1;
        }
      }

      const dataInNextLeftCell = data[rowIndex][cornersOfSelectedCells[1] - 1];
      const dataInNextRightCell = data[rowIndex][cornersOfSelectedCells[3] + 1];

      if (!!dataInNextLeftCell || !!dataInNextRightCell) {
        lastFilledInRowIndex = rowIndex;
      }
    }

    return lastFilledInRowIndex;
  }

  /**
   * Adds a selection from the start area to the specific row index.
   *
   * @private
   * @param {Array} selectStartArea selection area from which we start to create more comprehensive selection.
   * @param {Number} rowIndex
   */
  addSelectionFromStartAreaToSpecificRowIndex(selectStartArea, rowIndex) {
    this.hot.selection.highlight.getFill()
      .clear()
      .add(new CellCoords(
        selectStartArea[0],
        selectStartArea[1])
      )
      .add(new CellCoords(
        rowIndex,
        selectStartArea[3])
      );
  }

  /**
   * Sets selection based on passed corners.
   *
   * @private
   * @param {Array} cornersOfArea
   */
  setSelection(cornersOfArea) {
    this.hot.selectCell(...cornersOfArea, false, false);
  }

  /**
   * Try to select cells down to the last row in the left column and then returns if selection was applied.
   *
   * @private
   * @returns {Boolean}
   */
  selectAdjacent() {
    const cornersOfSelectedCells = this.getCornersOfSelectedCells();
    const lastFilledInRowIndex = this.getIndexOfLastAdjacentFilledInRow(cornersOfSelectedCells);

    if (lastFilledInRowIndex === -1 || lastFilledInRowIndex === void 0) {
      return false;
    }

    this.addSelectionFromStartAreaToSpecificRowIndex(cornersOfSelectedCells, lastFilledInRowIndex);

    return true;

  }

  /**
   * Resets selection of dragged area.
   *
   * @private
   */
  resetSelectionOfDraggedArea() {
    this.handleDraggedCells = 0;

    this.hot.selection.highlight.getFill().clear();
  }

  /**
   * Redraws borders.
   *
   * @private
   * @param {CellCoords} coords `CellCoords` coord object.
   */
  redrawBorders(coords) {
    this.hot.selection.highlight.getFill()
      .clear()
      .add(this.hot.getSelectedRangeLast().from)
      .add(this.hot.getSelectedRangeLast().to)
      .add(coords);

    this.hot.view.render();
  }

  /**
   * Get if mouse was dragged outside.
   *
   * @private
   * @param {MouseEvent} event `mousemove` event properties.
   * @returns {Boolean}
   */
  getIfMouseWasDraggedOutside(event) {
    const tableBottom = offset(this.hot.table).top - (window.pageYOffset ||
      document.documentElement.scrollTop) + outerHeight(this.hot.table);
    const tableRight = offset(this.hot.table).left - (window.pageXOffset ||
      document.documentElement.scrollLeft) + outerWidth(this.hot.table);

    return event.clientY > tableBottom && event.clientX <= tableRight;
  }

  /**
   * Bind the events used by the plugin.
   *
   * @private
   */
  registerEvents() {
    this.eventManager.addEventListener(document.documentElement, 'mouseup', (event) => this.onMouseUp(event));
    this.eventManager.addEventListener(document.documentElement, 'mousemove', event => this.onMouseMove(event));
  }

  /**
   * On cell corner double click callback.
   *
   * @private
   */
  onCellCornerDblClick() {
    const selectionApplied = this.selectAdjacent();

    if (selectionApplied) {
      this.fillIn();
    }
  }

  /**
   * On after cell corner mouse down listener.
   *
   * @private
   */
  onAfterCellCornerMouseDown() {
    this.handleDraggedCells = 1;
    this.mouseDownOnCellCorner = true;
  }

  /**
   * On before cell mouse over listener.
   *
   * @private
   * @param {CellCoords} coords `CellCoords` coord object.
   */
  onBeforeCellMouseOver(coords) {
    if (this.mouseDownOnCellCorner && !this.hot.view.isMouseDown() && this.handleDraggedCells) {
      this.handleDraggedCells += 1;

      this.showBorder(coords);
      this.addNewRowIfNeeded();
    }
  }

  /**
   * On mouse up listener.
   *
   * @private
   * @param {MouseEvent} event `mouseup` event properties.
   */
  onMouseUp(event) {
    if (this.handleDraggedCells) {
      if (this.handleDraggedCells > 1) {
        this.fillIn(event);
      }

      this.handleDraggedCells = 0;
      this.mouseDownOnCellCorner = false;
    }
  }

  /**
   * On mouse move listener.
   *
   * @private
   * @param {MouseEvent} event `mousemove` event properties.
   */
  onMouseMove(event) {
    const mouseWasDraggedOutside = this.getIfMouseWasDraggedOutside(event);

    if (this.addingStarted === false && this.handleDraggedCells > 0 && mouseWasDraggedOutside) {
      this.mouseDragOutside = true;
      this.addingStarted = true;

    } else {
      this.mouseDragOutside = false;
    }

    if (this.mouseDragOutside && this.autoInsertRow) {
      this.addRow();
    }
  }

  /**
   * Clears mapped settings.
   *
   * @private
   */
  clearMappedSettings() {
    this.directions.length = 0;
    this.autoInsertRow = false;
  }

  /**
   * Map settings.
   *
   * @private
   */
  mapSettings() {
    const mappedSettings = getMappedFillHandleSetting(this.hot.getSettings().fillHandle);
    this.directions = mappedSettings.directions;
    this.autoInsertRow = mappedSettings.autoInsertRow;
  }

  /**
   * Destroys the plugin instance.
   */
  destroy() {
    super.destroy();
  }
}

registerPlugin('autofill', Autofill);

export default Autofill;
