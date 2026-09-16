export interface D365ProductionOrder {
  ProductionOrder: string;
  ItemNumber: string;
  ItemDescription: string;
  CustomerAccount: string;
  CustomerName: string;
  CustomerPO: string;
  SalesOrder: string;
  SalesLine: string;
  BatchNumber: string;
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
}

export interface D365COCDocumentRecord {
  COCDocumentNumber: string;
  ProductionOrder: string;
  ItemNumber: string;
  CustomerPO: string;
  SalesOrder: string;
  SerialNumber?: string;
  BatchNumber?: string;
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
  CustomerPO: string;
  ExternalItemNumber: string; // Customer Part Number
  Quantity: number;
  UnitOfMeasure?: string;
  DeliveryDate?: string;
  dataAreaId?: string;
}

