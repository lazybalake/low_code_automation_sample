import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class InventoryApi implements ICredentialType {
	name = 'inventoryApi';

	displayName = 'Inventory API';

	icon: Icon = { light: 'file:../icons/inventory.svg', dark: 'file:../icons/inventory.dark.svg' };

	documentationUrl = 'https://docs.n8n.io/integrations/builtin/credentials/httprequest/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'http://app:3000',
			placeholder: 'http://app:3000',
			description:
				'Where the inventory API runs, without a trailing slash. In the bundled Docker Compose setup this is http://app:3000.',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description: 'The API_KEY value from your .env file',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'x-api-key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/me',
		},
	};
}
