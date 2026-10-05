export function taskStatuses(dept){const map={
 'Sampling Team':['Sample Request Received','Sample Not Available','Sample Under Process','Sample Ready','Sample Sent'],
 'SO Team':['SO Waiting','Sales Order Preparing','Needs Clarification','Sales Order Uploaded'],
 'Production Team':['EDD Request Received','EDD Accepted','Planning','Ready Tomorrow','Ready on Selected Date','Production Started','Part 1 Ready','Part 2 Ready','Mould Issue','Machine Not Allotted / Alternate Required','Raw Material Not Available','Production Completed','Assembling','Ready for Dispatch'],
 'Mould Team':['Development','Development EDR','Rework','Rework EDR','Mould Ready'],
 'Accounts Team':['Payment Approval Required','Payment Confirmation Pending','Payment Confirmed','Credit Approved','Statement Required','Account Clarified','Hold'],
 'Dispatch Team':['Dispatch Request Received','Today Dispatch','Today Evening Dispatch','Tomorrow Dispatch','Tomorrow First Dispatch','Top Most Urgent Dispatch','Asked Production Readiness','Goods Not Yet Ready','Goods Ready — Waiting for Vehicle','Party Will Collect','Part Quantity Dispatched','Fully Dispatched','Dispatched'],
 'Reception':['LR Copy Awaiting','LR Copy Received','LR Copy Sent to Customer'],
 'Quality Team':['Complaint Received','Under Checking','Attended','Corrective Action','Replacement In Progress','Replaced','Resolved'],
 'Assembling & Printing Team':['EDD Requested','EDD Confirmed','Started','Spares Ready','Part Quantity Ready','Full Quantity Ready','Ready for Dispatch'],
 'Audit Team':['Issue Received','Under Review','Clarification Required','GST Updated','Invoice Corrected','Resolved'],
 'PRT Team':['Cheque Ready — Collect It','Cheque Will Be Ready By Date','Direct Visit Requested','Cheque Collected','Ask to Collect Date','Directly Visited & Collected','Directly Visited — Commitment Date','Then Follow Up','Task Closed'],
 'Payment Follow-up':['TPCF — To Be Closed Follow-up','Commitment by Next Week','Callback Requested','Payment Date Promised','Payment Received','No Response'],
 'Marketing Payment Follow-up':['TPCF — To Be Closed Follow-up','Commitment by Next Week','Callback Requested','Payment Date Promised','Payment Received','No Response']};return map[dept]||['Assigned','In Process','Completed']}
export const DEPARTMENTS = ["Sampling Team", "SO Team", "Production Team", "Mould Team", "Accounts Team", "Dispatch Team", "Reception", "Quality Team", "Assembling & Printing Team", "Audit Team", "PRT Team", "Payment Follow-up"];
