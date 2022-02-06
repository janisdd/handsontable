import { isEmpty } from './../../helpers/mixed';

/**
 * Converts javascript array into HTMLTable.
 *
 * @param {Array} input Input array which will be converted to HTMLTable
 */
export function arrayToTable(input) {
  const inputLen = input.length;
  const result = ['<table>'];

  const tempElement = document.createElement('div');
  document.documentElement.appendChild(tempElement);

  for (let row = 0; row < inputLen; row += 1) {
    const rowData = input[row];
    const columnsLen = rowData.length;
    const columnsResult = [];

    if (row === 0) {
      result.push('<tbody>');
    }

    for (let column = 0; column < columnsLen; column += 1) {
      tempElement.innerText = `${isEmpty(rowData[column]) ? '' : rowData[column]}`;

      columnsResult.push(`<td>${tempElement.innerHTML}</td>`);
    }

    result.push('<tr>', ...columnsResult, '</tr>');

    if (row + 1 === inputLen) {
      result.push('</tbody>');
    }
  }

  document.documentElement.removeChild(tempElement);

  result.push('</table>');

  return result.join('');
}

/**
 * Helper to verify if DOM element is an HTMLTable element.
 *
 * @param {Element} element Node element to verify if it's an HTMLTable.
 */
function isHTMLTable(element) {
  return (element && element.nodeName || '').toLowerCase() === 'table';
}

/**
 * Converts HTMLTable or string into array.
 *
 * @param {Element|String} element Node element or string, which should contain `<table>...</table>`.
 */

const ESCAPED_HTML_CHARS = {
  '&nbsp;': '\x20',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
};
const regEscapedChars = new RegExp(Object.keys(ESCAPED_HTML_CHARS).map(key => `(${key})`).join('|'), 'gi');

export function tableToArray(element, rootDocument = document) {

  const settingsObj = {};
  const fragment = rootDocument.createDocumentFragment();
  const tempElem = rootDocument.createElement('div');

  fragment.appendChild(tempElem);

  let checkElement = element;

  if (typeof checkElement === 'string') {
    const escapedAdjacentHTML = checkElement.replace(/<td\b[^>]*?>([\s\S]*?)<\/\s*td>/g, (cellFragment) => {
      const openingTag = cellFragment.match(/<td\b[^>]*?>/g)[0];
      const cellValue = cellFragment
        .substring(openingTag.length, cellFragment.lastIndexOf('<')).replace(/(<(?!br)([^>]+)>)/gi, '');
      const closingTag = '</td>';

      return `${openingTag}${cellValue}${closingTag}`;
    });

    tempElem.insertAdjacentHTML('afterbegin', `${escapedAdjacentHTML}`);
    checkElement = tempElem.querySelector('table');
  }

  if (!checkElement || !isHTMLTable(checkElement)) {
    return;
  }

  const generator = tempElem.querySelector('meta[name$="enerator"]'); // we leave out the G because might be upper/lower
  const hasRowHeaders = checkElement.querySelector('tbody th') !== null;
  const trElement = checkElement.querySelector('tr');
  // we try to get the max col count...
  // however, this is not perfect as individual cells might have different spans... and we only check the first row
  const countCols = !trElement ? 0 : Array.from(trElement.cells)
    .reduce((cols, cell) => cols + cell.colSpan, 0) - (hasRowHeaders ? 1 : 0);
  const fixedRowsBottom = checkElement.tFoot && Array.from(checkElement.tFoot.rows) || [];
  const fixedRowsTop = [];
  let hasColHeaders = false;
  let thRowsLen = 0;
  let countRows = 0;

  // we omit row headers and col headers in the data
  if (checkElement.tHead) {
    const thRows = Array.from(checkElement.tHead.rows).filter((tr) => {
      const isDataRow = tr.querySelector('td') !== null;

      if (isDataRow) {
        fixedRowsTop.push(tr);
      }

      return !isDataRow;
    });

    thRowsLen = thRows.length;
    hasColHeaders = thRowsLen > 0;

    if (thRowsLen > 1) {
      settingsObj.nestedHeaders = Array.from(thRows).reduce((rows, row) => {
        const headersRow = Array.from(row.cells).reduce((headers, header, currentIndex) => {
          if (hasRowHeaders && currentIndex === 0) {
            return headers;
          }

          const {
            colSpan: colspan,
            innerHTML,
          } = header;
          const nextHeader = colspan > 1 ? { label: innerHTML, colspan } : innerHTML;

          headers.push(nextHeader);

          return headers;
        }, []);

        rows.push(headersRow);

        return rows;
      }, []);

    } else if (hasColHeaders) {
      settingsObj.colHeaders = Array.from(thRows[0].children).reduce((headers, header, index) => {
        if (hasRowHeaders && index === 0) {
          return headers;
        }

        headers.push(header.innerHTML);

        return headers;
      }, []);
    }
  }

  if (fixedRowsTop.length) {
    settingsObj.fixedRowsTop = fixedRowsTop.length;
  }
  if (fixedRowsBottom.length) {
    settingsObj.fixedRowsBottom = fixedRowsBottom.length;
  }

  const dataRows = [
    ...fixedRowsTop,
    ...Array.from(checkElement.tBodies).reduce((sections, section) => {
      sections.push(...Array.from(section.rows));

      return sections;
    }, []),
    ...fixedRowsBottom];

  countRows = dataRows.length;

  const dataArr = new Array(countRows);

  for (let r = 0; r < countRows; r++) {
    dataArr[r] = new Array(countCols);
  }

  const mergeCells = [];
  const rowHeaders = [];

  for (let row = 0; row < countRows; row++) {
    const tr = dataRows[row];
    const cells = Array.from(tr.cells);
    const cellsLen = cells.length;

    for (let cellId = 0; cellId < cellsLen; cellId++) {
      const cell = cells[cellId];
      const {
        nodeName,
        innerHTML,
        rowSpan: rowspan,
        colSpan: colspan,
      } = cell;

      // as merged cells contain null as data the first col we find with undefined is the first free cell
      const col = dataArr[row].findIndex(value => value === undefined);

      if (nodeName === 'TD') {
        if (rowspan > 1 || colspan > 1) {
          for (let rstart = row; rstart < row + rowspan; rstart++) {
            if (rstart < countRows) {
              for (let cstart = col; cstart < col + colspan; cstart++) {
                dataArr[rstart][cstart] = null;
              }
            }
          }

          const styleAttr = cell.getAttribute('style');
          const ignoreMerge = styleAttr && styleAttr.includes('mso-ignore:colspan');

          if (!ignoreMerge) {
            mergeCells.push({ col, row, rowspan, colspan });
          }
        }

        let cellValue = '';

        if (generator && /excel/gi.test(generator.content)) {
          cellValue = innerHTML.replace(/[\r\n][\x20]{0,2}/g, '\x20')
            .replace(/<br(\s*|\/)>[\r\n]?[\x20]{0,3}/gim, '\r\n');

        } else {
          cellValue = innerHTML.replace(/<br(\s*|\/)>[\r\n]?/gim, '\r\n');
        }

        dataArr[row][col] = cellValue.replace(regEscapedChars, match => ESCAPED_HTML_CHARS[match]);

      } else {
        rowHeaders.push(innerHTML);
      }
    }
  }

  if (mergeCells.length) {
    settingsObj.mergeCells = mergeCells;
  }
  if (rowHeaders.length) {
    settingsObj.rowHeaders = rowHeaders;
  }

  if (dataArr.length) {
    settingsObj.data = dataArr;
  }

  // we only need the data
  return settingsObj.data;
}
