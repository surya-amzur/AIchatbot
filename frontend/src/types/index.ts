export type User = {
	id: string;
	email: string;
	name: string;
};

export type LoginSuccessResponse = {
	status: string;
};

export type Message = {
	id: string;
	role: "user" | "assistant";
	content: string;
	created_at: string;
	attachments?: Attachment[];
};

export type Attachment = {
	file_name: string;
	mime_type: string;
	size_bytes: number;
	url: string;
};

export type ImageGenerateResponse = {
	status: string;
	thread_id: string;
	attachment: Attachment;
};

export type RagUploadResponse = {
	status: string;
	document_id: string;
	file_name: string;
	chunk_count: number;
	thread_id: string | null;
};

export type RagCitation = {
	document_id: string;
	file_name: string;
	chunk_index: number;
};

export type RagQueryResponse = {
	status: string;
	thread_id: string;
	answer: string;
	citations: RagCitation[];
};

export type Nl2SqlSchemaColumn = {
	name: string;
	type: string;
};

export type Nl2SqlSchemaTable = {
	name: string;
	columns: Nl2SqlSchemaColumn[];
};

export type Nl2SqlSchemaResponse = {
	status: string;
	tables: Nl2SqlSchemaTable[];
};

export type Nl2SqlQueryResponse = {
	status: string;
	sql: string;
	columns: string[];
	rows: Array<Record<string, unknown>>;
	row_count: number;
};

export type TabularUploadExcelResponse = {
	status: string;
	document_id: string;
	source_name: string;
	row_count: number;
	columns: string[];
	thread_id: string | null;
};

export type TabularUploadGSheetResponse = {
	status: string;
	document_id: string;
	source_name: string;
	row_count: number;
	columns: string[];
	thread_id: string | null;
};

export type TabularCitation = {
	document_id: string;
	source_name: string;
	row_index: number;
};

export type TabularQueryResponse = {
	status: string;
	thread_id: string;
	answer: string;
	citations: TabularCitation[];
};

export type ImageRuleResult = {
	rule: string;
	passed: boolean;
	evidence: string;
};

export type ImageRuleValidationResponse = {
	status: string;
	thread_id: string;
	extracted_data: Record<string, unknown>;
	results: ImageRuleResult[];
	image_name: string;
};

export type ChatHistoryResponse = {
	thread_id: string | null;
	messages: Message[];
	total_count: number;
	offset: number;
	limit: number | null;
	has_more: boolean;
};

export type ChatThreadSummary = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
	last_message: string | null;
};

export type ChatThreadsResponse = {
	threads: ChatThreadSummary[];
};

export type ManualSignupPayload = {
	email: string;
	name: string;
	password: string;
};

export type ManualLoginPayload = {
	email: string;
	password: string;
};
