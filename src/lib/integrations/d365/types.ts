export interface D365ProductionOrder {
  ProductionOrder: string;
  ItemNumber: string;
  ItemDescription: string;
  CustomerAccount: string;
  CustomerName: string;
  DeliveryAddressName?: string;
  CustomerPO: string;
  SalesOrder: string;
  SalesLine: string;
  BatchNumber?: string;
  CustomerPartNumber?: string;
  dataAreaId?: string;
  ProductionOrderStatus?: string;
  SerialNumber?: string;
  DrawingNumber?: string;
  Revision?: string;
  Quantity: number;
  UnitOfMeasure: string;
  RemainingQuantity: number;
  Specification?: string;
  DeliveryDate?: string;
  // COC Qualification Fields
  certifiedQuantity?: number;
  pendingCocQuantity?: number;
  isFullyCertified?: boolean;
  cocList?: Array<{
    id: string;
    coc_number: string;
    serial_number: string | null;
    quantity: number;
    status: string;
    created_at?: string;
  }>;
}

export interface D365COCDocumentRecord {
  COCDocumentNumber: string;
  ProductionOrder: string;
  ItemNumber: string;
  CustomerPO: string;
  SalesOrder: string;
  SerialNumber?: string;
  BatchNumber?: string;
  DeliveryDate?: string;
  DocumentURL: string;
  IssuedBy: string;
  IssueDate: string;
}

export interface D365SalesOrderLine {
  SalesOrder: string;
  LineNumber: string;
  ItemNumber: string;
  ItemDescription?: string;
  CustomerAccount: string;
  CustomerName: string;
  DeliveryAddressName?: string;
  CustomerPO: string;
  ExternalItemNumber: string; // Customer Part Number
  Quantity: number;
  UnitOfMeasure?: string;
  DeliveryDate?: string;
  LineStatus?: string;
  dataAreaId?: string;
  // COC Allocation Fields
  assignedQuantity?: number;
  remainingSalesQty?: number;
  isFullyAssigned?: boolean;
  assignedCocs?: Array<{
    id: string;
    coc_number: string;
    production_order: string;
    serial_number: string | null;
    quantity: number;
    status: string;
    created_at?: string;
  }>;
}

