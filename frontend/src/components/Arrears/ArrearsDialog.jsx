import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Typography,
  Box,
  Divider,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import { format } from 'date-fns';

const ArrearsDialog = ({ open, onClose, employeeId, month, onSave }) => {
  const [arrears, setArrears] = useState([]);
  const [settlements, setSettlements] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open && employeeId) {
      fetchPendingArrears();
    }
  }, [open, employeeId]);

  const fetchPendingArrears = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(`/api/arrears/employee/${employeeId}/pending`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch pending arrears');
      }

      const data = await response.json();
      setArrears(data.data || []);

      // Initialize settlements with remaining amounts
      const initialSettlements = {};
      (data.data || []).forEach(ar => {
        initialSettlements[ar._id] = ar.remainingAmount;
      });
      setSettlements(initialSettlements);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching arrears:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettlementChange = (arId, amount) => {
    const maxAmount = arrears.find(a => a._id === arId)?.remainingAmount || 0;
    const numAmount = Number(amount);
    
    setSettlements(prev => ({
      ...prev,
      [arId]: Math.min(Math.max(0, numAmount), maxAmount)
    }));
  };

  const handleSubmit = () => {
    const settlementData = Object.entries(settlements)
      .filter(([_, amount]) => amount > 0)
      .map(([arId, amount]) => ({ 
        arrearId: arId, 
        amount: Number(amount) 
      }));

    if (settlementData.length === 0) {
      setError('Please select at least one arrear to settle');
      return;
    }

    onSave(settlementData);
    onClose();
  };

  const totalSettlementAmount = Object.values(settlements).reduce((sum, val) => sum + (val || 0), 0);

  if (loading) {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>Process Arrears</DialogTitle>
        <DialogContent sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
          <CircularProgress />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Process Arrears for {month ? format(new Date(month + '-01'), 'MMMM yyyy') : 'N/A'}
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {arrears.length === 0 ? (
          <Typography color="textSecondary" sx={{ py: 3 }}>
            No pending arrears found for this employee.
          </Typography>
        ) : (
          <>
            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table>
                <TableHead>
                  <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
                    <TableCell><strong>Period</strong></TableCell>
                    <TableCell><strong>Reason</strong></TableCell>
                    <TableCell align="right"><strong>Total (₹)</strong></TableCell>
                    <TableCell align="right"><strong>Settled (₹)</strong></TableCell>
                    <TableCell align="right"><strong>Remaining (₹)</strong></TableCell>
                    <TableCell align="right"><strong>Settle Amount (₹)</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {arrears.map(ar => (
                    <TableRow key={ar._id}>
                      <TableCell>
                        <Typography variant="body2">
                          {ar.type === 'direct' ? '—' : `${ar.startMonth || '—'} to ${ar.endMonth || '—'}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap title={ar.reason}>
                          {ar.reason}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {ar.totalAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell align="right">
                        {(ar.settlementHistory?.reduce((sum, s) => sum + s.amount, 0) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell align="right">
                        <Chip
                          label={ar.remainingAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          color={ar.remainingAmount > 0 ? 'warning' : 'success'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={settlements[ar._id] || 0}
                          onChange={(e) => handleSettlementChange(ar._id, e.target.value)}
                          inputProps={{ 
                            min: 0, 
                            max: ar.remainingAmount,
                            step: 0.01
                          }}
                          size="small"
                          sx={{ width: 120 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Settlement History */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                <strong>Settlement History</strong>
              </Typography>
              <Divider sx={{ mb: 1 }} />
              {arrears.some(ar => ar.settlementHistory?.length > 0) ? (
                <Box sx={{ maxHeight: 200, overflowY: 'auto' }}>
                  {arrears.map(ar => 
                    ar.settlementHistory?.map((s, idx) => (
                      <Box key={`${ar._id}-${idx}`} sx={{ mb: 1, p: 1, backgroundColor: '#f9f9f9', borderRadius: 1 }}>
                        <Typography variant="body2">
                          <strong>{ar.type === 'direct' ? 'Direct' : `${ar.startMonth} to ${ar.endMonth}`}:</strong> ₹{s.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} settled on {format(new Date(s.settledAt), 'dd MMM yyyy')}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              ) : (
                <Typography variant="body2" color="textSecondary">
                  No settlement history available.
                </Typography>
              )}
            </Box>

            {/* Summary */}
            <Box sx={{ p: 2, backgroundColor: '#f0f7ff', borderRadius: 1 }}>
              <Typography variant="body2">
                <strong>Total Amount to Settle:</strong> ₹{totalSettlementAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </Typography>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained" 
          color="primary"
          disabled={arrears.length === 0 || totalSettlementAmount <= 0}
        >
          Save Settlements
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ArrearsDialog;
