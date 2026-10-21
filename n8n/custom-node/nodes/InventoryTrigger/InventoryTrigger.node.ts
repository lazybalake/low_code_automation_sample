import { createHmac, timingSafeEqual } from 'node:crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestMethods,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';

/**
 * Programmatic-style trigger. When the workflow is published, n8n calls `create`, which
 * registers this node's webhook URL with POST /api/hooks. Unpublishing calls `delete`.
 * Each subscription gets its own secret, used to verify the x-inventory-signature header.
 */

type HookContext = IHookFunctions | IWebhookFunctions;

async function apiRequest(
	this: HookContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('inventoryApi');
	const baseUrl = String(credentials.baseUrl).replace(/\/+$/, '');
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'inventoryApi', {
			method,
			url: `${baseUrl}/api${path}`,
			body,
			json: true,
		})) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

function signatureMatches(secret: string, timestamp: string, body: string, signature: string): boolean {
	if (!secret || !timestamp || !signature) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
	const expected = Buffer.from('sha256=' + createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex'));
	const given = Buffer.from(signature);
	return expected.length === given.length && timingSafeEqual(expected, given);
}

export class InventoryTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Inventory Trigger',
		name: 'inventoryTrigger',
		icon: { light: 'file:../../icons/inventory.svg', dark: 'file:../../icons/inventory.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when the inventory API sends an event',
		defaults: { name: 'Inventory Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'inventoryApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['order.created'],
				options: [
					{ name: 'All Events', value: '*' },
					{ name: 'Inventory Adjusted', value: 'inventory.adjusted' },
					{ name: 'Low Stock', value: 'inventory.low_stock' },
					{ name: 'Order Created', value: 'order.created' },
					{ name: 'Order Status Changed', value: 'order.status_changed' },
					{ name: 'Purchase Order Created', value: 'purchase_order.created' },
					{ name: 'Purchase Order Status Changed', value: 'purchase_order.status_changed' },
				],
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description: 'Whether to reject deliveries whose x-inventory-signature does not match this subscription secret',
			},
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				options: [
					{ name: 'Event Data Only', value: 'data', description: 'The order, product or purchase order payload' },
					{ name: 'Full Event', value: 'event', description: 'ID, type, timestamp and data' },
				],
				default: 'data',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (!staticData.hookId) return false;
				try {
					const hook = await apiRequest.call(this, 'GET', `/hooks/${staticData.hookId as string}`);
					const wanted = (this.getNodeParameter('events') as string[]).slice().sort().join(',');
					const current = ((hook.events as string[]) ?? []).slice().sort().join(',');
					if (hook.targetUrl === this.getNodeWebhookUrl('default') && wanted === current) return true;
					// The URL or event list changed: drop the old subscription so create() makes a fresh one.
					await apiRequest.call(this, 'DELETE', `/hooks/${staticData.hookId as string}`);
				} catch (error) {
					// Usually a 404: the API no longer knows this hook (its data was reset). Recreate it.
					this.logger.warn(`Inventory hook ${staticData.hookId as string} not usable, recreating`, { error });
				}
				delete staticData.hookId;
				delete staticData.secret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const hook = await apiRequest.call(this, 'POST', '/hooks', {
					targetUrl: this.getNodeWebhookUrl('default') as string,
					events: this.getNodeParameter('events') as string[],
				});
				const staticData = this.getWorkflowStaticData('node');
				staticData.hookId = hook.id;
				staticData.secret = hook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				if (staticData.hookId) {
					try {
						await apiRequest.call(this, 'DELETE', `/hooks/${staticData.hookId as string}`);
					} catch (error) {
						// Already gone on the API side, so there is nothing left to remove.
						this.logger.warn(`Could not delete inventory hook ${staticData.hookId as string}`, { error });
					}
				}
				delete staticData.hookId;
				delete staticData.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const event = this.getBodyData() as IDataObject;

		if (this.getNodeParameter('verifySignature', true) as boolean) {
			const headers = this.getHeaderData() as IDataObject;
			const secret = (this.getWorkflowStaticData('node').secret as string) ?? '';
			const req = this.getRequestObject() as unknown as { rawBody?: Buffer };
			const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(event);
			const ok = signatureMatches(
				secret,
				String(headers['x-inventory-timestamp'] ?? ''),
				raw,
				String(headers['x-inventory-signature'] ?? ''),
			);
			// Manual test runs use n8n's test URL, which has no stored secret, so only enforce when one exists.
			if (secret && !ok) {
				const res = this.getResponseObject();
				res.status(401).json({ error: 'invalid signature' });
				return { noWebhookResponse: true };
			}
		}

		const output = this.getNodeParameter('output', 'data') as string;
		const payload = output === 'event' ? event : ((event.data as IDataObject) ?? event);
		return { workflowData: [this.helpers.returnJsonArray(payload)] };
	}
}
