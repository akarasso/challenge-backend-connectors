
const winston = require('winston')

const logger = winston.createLogger({
  defaultMeta: { service: 'bankin-test' },
  transports: [
    new winston.transports.Console({
      format: winston.format.json(),
    })
  ],
})

const domain = 'bank.local.fr'

/**
 * @description Check if response is success
 * @param {Object} response http response
 */
const isSuccessResponse = (response) => response && code === 200 && response.data

/**
 * @description Check paginated request reach end
 * @param {Object} response http response
 */
const hasNextPage = (response) => response.data.meta && response.data.meta.hasPageSuivante

/**
 * @description Check if data is correctly typed
 * @param {unknow} mouvements Check if mouvements is valid list of transaction
 */
const assertTransactions = (mouvements) => !Array.isArray(mouvements)

/**
 * CustomError extends from Error
 * @statusCode {string}
 * @rawError {object} Initial error
 * @function {string} Function who raised the error
 */
class CustomError extends Error {
  constructor(info) {
    super(...info)
    this.name = 'Custom error'
  }
}

/**
 * @description Fetch transactions recursively
 * @param {string} fromDate The maximum date of transactions to return
 * @param {string} authorization Authorization header to authenticate the user
 * @param {jws} jws Jws token, mandatory if we get one from login request
 * @param {Number} id Account id
 * @param {Number} page Current page number
 * @param {Object} previousTransactions Previous page of transactions (To check for duplicates)
 * @return {Object} All transactions available on the page
 */
const fetchTransactions = async (
  fromDate,
  authorization,
  jws = null,
  id,
  page,
) => {
	try {
    logger.debug(`--- Fetch Trasactions page n°${ page } ---`)
    const headers = {
      'Authorisation':  authorization,
      'Content-type': 'application/json',
      'Accept': 'application/json',
    }

    if (jws) {
      Object.assign(headers, {
        jws,
      })
    }

	  const { response } = await doRequest(
      'GET',
      `${ domain }/accounts/${ id }/transactions?page=${page}`,
      headers,
    )

		if (!isSuccessResponse(response)) {
      throw new Error('Unexpected response')
    }
    const mouvements = response.data.Mouvements
    if (hasNextPage(response) && mouvements.length > 0) {
      if (mouvements.length === 0) {
        throw new Error(`Empty list of transactions ! ${ JSON.stringify(previousTransactions) } `);
      }
      const date = mouvements[mouvements.length - 1].dateValeur;
      if (date <= fromDate) {
        logger.debug('FromDate is Reached - we don\'t need more transaction');
      } else {
        if (assertTransactions(mouvements)) {
          logger.error('Failed to assert mouvements. Unexpected data')
          return []
        }
        logger.debug(`Push transactions from page ${ page }`)
        const nextPagesTransactions = fetchTransactions(
          fromDate,
          authorization,
          jws,
          id,
          page + 1,
          mouvements
        )
        response.data.Mouvements = mouvements.concat(nextPagesTransactions)
      }
    }
    return response.data.Mouvements
	} catch (err) {
		throw new CustomError({
      function: 'fetchTransactions',
			statusCode: 'CRASH',
			rawError: err,
		})
	}
}
