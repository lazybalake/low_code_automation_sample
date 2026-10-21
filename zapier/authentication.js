'use strict';

const { api } = require('./lib/api');

module.exports = {
  type: 'custom',
  fields: [
    {
      key: 'baseUrl',
      label: 'API Base URL',
      required: true,
      type: 'string',
      helpText:
        'The public URL of your inventory API, for example your tunnel URL `https://something.trycloudflare.com`. Zapier cannot reach `localhost`.',
    },
    {
      key: 'apiKey',
      label: 'API Key',
      required: true,
      type: 'password',
      helpText: 'The `API_KEY` from your `.env` file.',
    },
  ],
  test: async (z, bundle) => {
    const response = await z.request({ url: api(bundle, '/me') });
    return response.data;
  },
  // bundle.inputData holds whatever test() returned.
  connectionLabel: (z, bundle) => bundle.inputData?.storeName || 'Inventory API',
};
