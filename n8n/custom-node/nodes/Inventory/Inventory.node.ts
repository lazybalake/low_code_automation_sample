import {
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';

/**
 * Declarative-style node: n8n builds each HTTP request from the `routing` blocks below,
 * so there is no execute() method. See docs.n8n.io → Create nodes → declarative-style tutorial.
 */

const ORDER_STATUSES = ['backordered', 'reserved', 'paid', 'shipped', 'delivered', 'cancelled'];
const PO_STATUSES = ['requested', 'ordered', 'received', 'cancelled'];
const toOptions = (values: string[]) =>
	values.map((v) => ({ name: v.charAt(0).toUpperCase() + v.slice(1), value: v }));

/** Builds the POST /api/orders body from either the line-item UI or a JSON array. */
async function buildOrderBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const mode = this.getNodeParameter('itemsInput', 'fields') as string;
	let items: Array<{ sku: string; qty: number }>;
	if (mode === 'json') {
		const raw = this.getNodeParameter('itemsJson', '[]') as string | IDataObject[];
		try {
			items = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Array<{ sku: string; qty: number }>;
		} catch {
			throw new NodeOperationError(this.getNode(), 'Items (JSON) is not valid JSON');
		}
	} else {
		items = this.getNodeParameter('items.item', []) as Array<{ sku: string; qty: number }>;
	}
	if (!Array.isArray(items) || items.length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one line item');
	}
	const additional = this.getNodeParameter('additionalFields', {}) as IDataObject;
	requestOptions.body = {
		customer: {
			name: this.getNodeParameter('customerName') as string,
			email: this.getNodeParameter('customerEmail') as string,
		},
		items: items.map((i) => ({ sku: String(i.sku), qty: Number(i.qty) })),
		...additional,
	};
	return requestOptions;
}

const resource: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	options: [
		{ name: 'Order', value: 'order' },
		{ name: 'Product', value: 'product' },
		{ name: 'Purchase Order', value: 'purchaseOrder' },
	],
	default: 'order',
};

// ---------------- Product ----------------

const productOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['product'] } },
	options: [
		{
			name: 'Adjust Stock',
			value: 'adjustStock',
			action: 'Adjust stock for a product',
			description: 'Add or remove on-hand units (positive or negative delta)',
			routing: { request: { method: 'POST', url: '=/products/{{$parameter.productRef}}/adjust' } },
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get a product',
			routing: { request: { method: 'GET', url: '=/products/{{$parameter.productRef}}' } },
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many products',
			routing: { request: { method: 'GET', url: '/products' } },
		},
		{
			name: 'Get Low Stock',
			value: 'getLowStock',
			action: 'Get products at or below their reorder point',
			routing: { request: { method: 'GET', url: '/inventory/low-stock' } },
		},
	],
	default: 'get',
};

const productFields: INodeProperties[] = [
	{
		displayName: 'Product (ID or SKU)',
		name: 'productRef',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'WB-750',
		displayOptions: { show: { resource: ['product'], operation: ['get', 'adjustStock'] } },
	},
	{
		displayName: 'Delta',
		name: 'delta',
		type: 'number',
		required: true,
		default: 1,
		description: 'Units to add (positive) or remove (negative)',
		displayOptions: { show: { resource: ['product'], operation: ['adjustStock'] } },
		routing: { send: { type: 'body', property: 'delta' } },
	},
	{
		displayName: 'Reason',
		name: 'reason',
		type: 'string',
		default: 'n8n adjustment',
		displayOptions: { show: { resource: ['product'], operation: ['adjustStock'] } },
		routing: { send: { type: 'body', property: 'reason' } },
	},
	{
		displayName: 'Only Low Stock',
		name: 'onlyLowStock',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
		routing: { send: { type: 'query', property: 'lowStock', value: '={{ $value ? "true" : undefined }}' } },
	},
];

// ---------------- Order ----------------

const orderOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['order'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create an order',
			description: 'Reserves stock if available, otherwise the order is backordered',
			routing: { request: { method: 'POST', url: '/orders' }, send: { preSend: [buildOrderBody] } },
		},
		{
			name: 'Get',
			value: 'get',
			action: 'Get an order',
			routing: { request: { method: 'GET', url: '=/orders/{{$parameter.orderId}}' } },
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many orders',
			routing: { request: { method: 'GET', url: '/orders' } },
		},
		{
			name: 'Update Status',
			value: 'updateStatus',
			action: 'Update an order status',
			routing: { request: { method: 'POST', url: '=/orders/{{$parameter.orderId}}/status' } },
		},
	],
	default: 'create',
};

const orderFields: INodeProperties[] = [
	{
		displayName: 'Customer Name',
		name: 'customerName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Customer Email',
		name: 'customerEmail',
		type: 'string',
		placeholder: 'name@email.com',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Items Input',
		name: 'itemsInput',
		type: 'options',
		options: [
			{ name: 'Using Fields Below', value: 'fields' },
			{ name: 'Using JSON', value: 'json' },
		],
		default: 'fields',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Items',
		name: 'items',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		default: {},
		placeholder: 'Add Line Item',
		displayOptions: { show: { resource: ['order'], operation: ['create'], itemsInput: ['fields'] } },
		options: [
			{
				name: 'item',
				displayName: 'Line Item',
				values: [
					{ displayName: 'SKU', name: 'sku', type: 'string', default: '' },
					{ displayName: 'Quantity', name: 'qty', type: 'number', typeOptions: { minValue: 1 }, default: 1 },
				],
			},
		],
	},
	{
		displayName: 'Items (JSON)',
		name: 'itemsJson',
		type: 'json',
		default: '[{ "sku": "WB-750", "qty": 1 }]',
		description: 'Array of { "sku", "qty" } objects, handy for mapping line items from a previous node',
		displayOptions: { show: { resource: ['order'], operation: ['create'], itemsInput: ['json'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
		options: [
			{
				displayName: 'External ID',
				name: 'externalId',
				type: 'string',
				default: '',
				description: 'Your shop or form ID. Sending the same one twice returns the existing order instead of a duplicate.',
			},
			{ displayName: 'Note', name: 'note', type: 'string', default: '' },
		],
	},
	{
		displayName: 'Order ID',
		name: 'orderId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'ord_1001',
		displayOptions: { show: { resource: ['order'], operation: ['get', 'updateStatus'] } },
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		options: toOptions(ORDER_STATUSES),
		required: true,
		default: 'paid',
		displayOptions: { show: { resource: ['order'], operation: ['updateStatus'] } },
		routing: { send: { type: 'body', property: 'status' } },
	},
	{
		displayName: 'Carrier',
		name: 'carrier',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['updateStatus'], status: ['shipped'] } },
		routing: { send: { type: 'body', property: 'carrier', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Tracking Number',
		name: 'trackingNumber',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['updateStatus'], status: ['shipped'] } },
		routing: { send: { type: 'body', property: 'trackingNumber', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Note',
		name: 'statusNote',
		type: 'string',
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['updateStatus'] } },
		routing: { send: { type: 'body', property: 'note', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Filter by Status',
		name: 'filterStatus',
		type: 'options',
		options: [{ name: 'Any', value: '' }, ...toOptions(ORDER_STATUSES)],
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
		routing: { send: { type: 'query', property: 'status', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
		routing: { send: { type: 'query', property: 'limit' } },
	},
];

// ---------------- Purchase order ----------------

const purchaseOrderOperations: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { resource: ['purchaseOrder'] } },
	options: [
		{
			name: 'Create',
			value: 'create',
			action: 'Create a purchase order',
			description: 'Keeps one open purchase order per product unless deduplication is turned off',
			routing: { request: { method: 'POST', url: '/purchase-orders' } },
		},
		{
			name: 'Get Many',
			value: 'getAll',
			action: 'Get many purchase orders',
			routing: { request: { method: 'GET', url: '/purchase-orders' } },
		},
		{
			name: 'Update Status',
			value: 'updateStatus',
			action: 'Update a purchase order status',
			description: 'Marking it received adds the stock and fills waiting backorders',
			routing: { request: { method: 'POST', url: '=/purchase-orders/{{$parameter.purchaseOrderId}}/status' } },
		},
	],
	default: 'create',
};

const purchaseOrderFields: INodeProperties[] = [
	{
		displayName: 'SKU',
		name: 'sku',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'sku' } },
	},
	{
		displayName: 'Quantity Mode',
		name: 'qtyMode',
		type: 'options',
		options: [
			{ name: 'Product Reorder Quantity', value: 'default' },
			{ name: 'At Least', value: 'atLeast', description: 'This many, or the reorder quantity if it is bigger' },
			{ name: 'Exact', value: 'qty' },
		],
		default: 'default',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['create'] } },
	},
	{
		displayName: 'Quantity',
		name: 'qty',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 1,
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['create'], qtyMode: ['atLeast', 'qty'] } },
		routing: { send: { type: 'body', property: '={{ $parameter.qtyMode }}' } },
	},
	{
		displayName: 'Reason',
		name: 'poReason',
		type: 'string',
		default: 'n8n',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'reason' } },
	},
	{
		displayName: 'Deduplicate',
		name: 'dedupe',
		type: 'boolean',
		default: true,
		description: 'Whether to return the open purchase order for this product instead of creating a second one',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['create'] } },
		routing: { send: { type: 'body', property: 'dedupe' } },
	},
	{
		displayName: 'Purchase Order ID',
		name: 'purchaseOrderId',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'po_1001',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['updateStatus'] } },
	},
	{
		displayName: 'Status',
		name: 'poStatus',
		type: 'options',
		options: toOptions(PO_STATUSES),
		required: true,
		default: 'ordered',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['updateStatus'] } },
		routing: { send: { type: 'body', property: 'status' } },
	},
	{
		displayName: 'Filter',
		name: 'poFilter',
		type: 'options',
		options: [{ name: 'Any', value: '' }, { name: 'Open (Requested or Ordered)', value: 'open' }, ...toOptions(PO_STATUSES)],
		default: 'open',
		displayOptions: { show: { resource: ['purchaseOrder'], operation: ['getAll'] } },
		routing: { send: { type: 'query', property: 'status', value: '={{ $value || undefined }}' } },
	},
];

export class Inventory implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Inventory',
		name: 'inventory',
		icon: { light: 'file:../../icons/inventory.svg', dark: 'file:../../icons/inventory.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with products, stock, orders and purchase orders in the inventory API',
		defaults: { name: 'Inventory' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'inventoryApi', required: true }],
		requestDefaults: {
			baseURL:
				'={{ String($credentials.baseUrl).endsWith("/") ? String($credentials.baseUrl).slice(0, -1) : $credentials.baseUrl }}/api',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			resource,
			productOperations,
			...productFields,
			orderOperations,
			...orderFields,
			purchaseOrderOperations,
			...purchaseOrderFields,
		],
	};
}
