const { Requester, Validator } = require('@chainlink/external-adapter')

// Define custom error scenarios for the API.
// Return true for the adapter to retry.
const customError = (data) => {
  if (data.Response === 'Error') return true
  return false
}

// Define custom parameters to be used by the adapter.
// Extra parameters can be stated in the extra object,
// with a Boolean value indicating whether or not they
// should be required.
const customParams = {
  base: {
    aliases: ['coin', 'cid', 'symbol', 'sym'],
    description: 'The coin id of the currency to query',
    required: true,
    type: 'string',
  },
  vs_currency: {
    aliases: ['convert', 'quote', 'market'],
    description: 'The symbol of the currency to convert to',
    required: true,
    type: 'string',
  },
  start: {
    aliases: ['from'],
    description: 'Timestamp (Unix or ISO 8601) to start returning quotes for',
    required: true,
    type: 'string',
  }, 
  end: {
    aliases: ['to'],
    description: 'Timestamp (Unix or ISO 8601) to stop returning quotes for',
    required: true,
    type: 'string',
  },
  withDetails: {
    aliases: ['average'],
    description: 'Whether price details should be returned, false as default',
    required: false,
    type: 'boolean',
  }
}

const createRequest = (input, callback) => {
  // The Validator helps you validate the Chainlink request data
  const validator = new Validator(callback, input, customParams)
  const jobRunID = validator.validated.id
  const coin = validator.validated.data.base
  const url = `https://api.coingecko.com/api/v3/coins/${coin.toLowerCase()}/market_chart/range`

  const params = {
    vs_currency: validator.validated.data.vs_currency,
    from: validator.validated.data.start,
    to: validator.validated.data.end
  }

  // This is where you would add method and headers
  // you can add method like GET or POST and add it to the config
  // The default is GET requests
  // method = 'get' 
  // headers = 'headers.....'
  const config = {
    method: 'get',
    url,
    params
  }

  // The Requester allows API calls be retry in case of timeout
  // or connection failure
  Requester.request(config, customError)
    .then(response => {
      // It's common practice to store the desired value at the top-level
      // result key. This allows different adapters to be compatible with
      // one another.

      let sumPrice = 0
      const prices = response.data.prices
      for (let price of prices) {
        sumPrice += price[1]
      }
      const averagePrice = sumPrice / prices.length

      if (validator.validated.data.withDetails) {
        response.data = {prices: response.data.prices}
      } else {
        response.data = {}
      }
      response.data.result = {average: averagePrice}

      callback(
        response.status, 
        Requester.success(jobRunID, response)
      )
    })
    .catch(error => {
      callback(500, Requester.errored(jobRunID, error))
    })
}

// This is a wrapper to allow the function to work with
// GCP Functions
exports.gcpservice = (req, res) => {
  createRequest(req.body, (statusCode, data) => {
    res.status(statusCode).send(data)
  })
}

// This is a wrapper to allow the function to work with
// AWS Lambda
exports.handler = (event, context, callback) => {
  createRequest(event, (statusCode, data) => {
    callback(null, data)
  })
}

// This is a wrapper to allow the function to work with
// newer AWS Lambda implementations
exports.handlerv2 = (event, context, callback) => {
  createRequest(JSON.parse(event.body), (statusCode, data) => {
    callback(null, {
      statusCode: statusCode,
      body: JSON.stringify(data),
      isBase64Encoded: false
    })
  })
}

// This allows the function to be exported for testing
// or for running in express
module.exports.createRequest = createRequest
