# Payroll Calculation Formulas & Steps

This document outlines the step-by-step logic and formulas used within the system to calculate **Regular Monthly Salary** and **2nd Salary**.

---

## 1. Regular Salary Calculation

### **Step 1: Determine Days & Attendance**

The system first gathers attendance data for the month from the `Pay Register` (or `Monthly Attendance Summary`).

* **Total Days in Month (TDM):** Number of days in the current calendar month (e.g., 30 or 31).
* **Payable Shifts:** Count of actual shifts worked.
* **Weekly Offs:** Count of eligible weekly offs.
* **Holidays:** Count of eligible holidays.
* **Paid Leaves Taken:** Count of approved paid leaves used.
* **Department Paid Leaves Limit:** The maximum paid leaves allowed by the department.

**Logic for Adjusted Payable Shifts:**
> If an employee has not used all their allocated paid leaves, the remaining balance is added to their payable shifts.
> `Remaining Paid Leaves = Max(0, Department Limit - Leaves Taken)`
> `Adjusted Payable Shifts = Payable Shifts + Remaining Paid Leaves`

### **Step 2: Basic Pay Calculation**

* **Base:** `Employee Gross Salary` (from Employee Profile)
* **Per Day Rate:** `Gross Salary / Total Days in Month`
* **Basic Pay (Earned):**
    > `Earned Basic Pay = Adjusted Payable Shifts * Per Day Rate`

### **Step 3: Overtime (OT) Pay**

* **OT Hours:** Total approved OT hours from attendance.
* **OT Rate Per Hour:**
    > `(Gross Salary / 30) / 8`  *(Standard assumption: 30 days, 8-hour shifts)*
* **Total OT Pay:**
    > `OT Pay = OT Hours * OT Rate Per Hour`

### **Step 4: Allowances**

Allowances are calculated based on departmental rules (Fixed Amount or Percentage of Basic/Gross).

* **Total Allowances:** Sum of all applicable allowances.

### **Step 5: Gross Earnings**
>
> `Gross Earning = Earned Basic Pay + OT Pay + Total Allowances + Arrears (if any)`

### **Step 6: Deductions**

Deductions are subtracted from the gross earnings.

* **A. Attendance Deduction (Late/Early Out):**
  * Calculated based on `Late Count` + `Early Out Count`.
  * Example Rule: "For every 3 late marks, deduct 0.5 days of salary."
  * `Deduction Amount = Deducted Days * Per Day Rate`

* **B. Permission Deduction:**
  * Calculated based on `Permission Count` exceeding the allowed limit (e.g., 2 per month).
  * `Excess Permissions = Max(0, Total Permissions - Allowed Limit)`
  * `Deduction Amount = Excess Permissions * (Per Day Rate / Division Factor)`

* **C. Leave Deduction (Unpaid Leaves):**
  * Calculated for approved leaves that exceed the paid leave balance.
  * `Deduction Amount = Unpaid Leave Days * Per Day Rate`

* **D. PF / ESI / PT:**
  * Calculated as per statutory percentages (e.g., PF = 12% of Basic, ESI = 0.75% of Gross).

* **Total Deductions:**
    > `Sum of (Attendance + Permission + Leave + PF + ESI + Other Deductions)`

### **Step 7: Loans & Advances**

* **EMI:** Monthly installment for any active long-term loans.
* **Advance Recovery:** Full or partial recovery of salary advances taken during the month.

### **Step 8: Net Salary**
>
> `Net Salary = Gross Earnings - Total Deductions - Total EMI - Advance Recovery`
> *Result is rounded off to the nearest integer.*

---

## 2. Second Salary Calculation

The "2nd Salary" is a separate payroll run, typically for specific allowances or secondary payments. It uses the `Second Salary` field from the employee profile as its base.

### **Step 1: Determine Base & Rates**

* **Base:** `Employee Second Salary` (from Employee Profile)
* **Per Day Rate:** `Second Salary / Total Days in Month`

### **Step 2: Calculate Paid Days**

* **Physical Units:** Sum of actual worked/eligible days.
    > `Physical Units = Payable Shifts + Paid Leaves + Weekly Offs + Holidays`
* **Raw Total Days:**
    > `Raw Total Days = Physical Units`  *(Extra Days are assumed to be included in Payable Shifts if applicable)*

### **Step 3: Split Logic (Base vs. Incentive)**

To keep accounting clean, the days are split into "Standard Month Days" and "Incentive (Extra) Days".

* **Capping Logic:**
  * If `Raw Total Days > Total Days in Month`:
    * `Standard Paid Days = Total Days in Month`
    * `Extra Days = Raw Total Days - Total Days in Month`
  * Else:
    * `Standard Paid Days = Raw Total Days`
    * `Extra Days = 0`

### **Step 4: Earnings Calculation**

1. **Base Pay for Work:**
    > `Base Pay = Standard Paid Days * Per Day Rate`

2. **Incentive (Extra Days Pay):**
    > `Incentive Amount = Extra Days * Per Day Rate`

3. **OT Pay:**
    * Calculated similarly to regular salary but potentially using `Second Salary` as the base for the rate.
    > `OT Pay = OT Hours * OT Rate`

4. **Gross Second Salary:**
    > `Gross = Base Pay + Incentive + OT Pay + Allowances`

### **Step 5: Deductions**

Deductions logic follows the same structure as Regular Salary (Attendance, Permission, Leaves) but applies the **Second Salary Per Day Rate**.

* **Total Deductions:** Sum of all applicable deductions.

### **Step 6: Net Second Salary**
>
> `Net Second Salary = Gross Second Salary - Total Deductions`
> *Result is rounded off to the nearest integer.*
