import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';
import 'package:screenshot/screenshot.dart';
import 'package:path_provider/path_provider.dart';
import '../models/expense_entry.dart';
import '../repositories/expense_repository.dart';
import '../theme/app_theme.dart';
import '../widgets/numeric_input_field.dart';

/// Main expense entry screen with date picker and input fields.
class ExpenseEntryScreen extends StatefulWidget {
  const ExpenseEntryScreen({super.key});

  @override
  State<ExpenseEntryScreen> createState() => _ExpenseEntryScreenState();
}

class _ExpenseEntryScreenState extends State<ExpenseEntryScreen> {
  final ExpenseRepository _repository = ExpenseRepository();
  final _formKey = GlobalKey<FormState>();

  // Controllers for editable fields
  final _onlineReceivingController = TextEditingController();
  final _offlineReceivingController = TextEditingController();
  final _uoloReceivingController = TextEditingController();
  final _asReceivingController = TextEditingController();
  final _bankDepositController = TextEditingController();
  final _cashExpenseController = TextEditingController();
  final _reasonController = TextEditingController();

  DateTime _selectedDate = DateTime.now();
  ExpenseEntry? _currentEntry;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isEditMode = false;
  String? _errorMessage;
  int _currentStep = 0;
  bool _isEnglish = true;
  final ScreenshotController _screenshotController = ScreenshotController();

  String _t(String en, String hi) {
    return _isEnglish ? en : hi;
  }

  // Valid date range
  final DateTime _minDate = DateTime(2025, 12, 1);
  final DateTime _maxDate = DateTime(2026, 12, 31);

  @override
  void initState() {
    super.initState();
    _initializeAndLoad();
  }

  Future<void> _initializeAndLoad() async {
    try {
      await _repository.init();
      await _loadEntry();
    } catch (e) {
      setState(() {
        _errorMessage =
            _t('Failed to connect: ', 'कनेक्ट करने में विफल: ') + e.toString();
        _isLoading = false;
      });
    }
  }

  Future<void> _loadEntry() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _isEditMode = false;
    });

    try {
      final entry = await _repository.getEntry(_selectedDate);
      _populateFields(entry);
      setState(() {
        _currentEntry = entry;
        _isLoading = false;
        if (entry.existsInSheet && !_isEditMode) {
          _currentStep = 6;
        }
      });
    } catch (e) {
      setState(() {
        _errorMessage = e.toString();
        _isLoading = false;
      });
    }
  }

  void _populateFields(ExpenseEntry entry) {
    _onlineReceivingController.text = _formatValue(entry.onlineReceiving);
    _offlineReceivingController.text = _formatValue(entry.offlineReceiving);
    _uoloReceivingController.text = _formatValue(entry.uoloReceiving);
    _asReceivingController.text = _formatValue(entry.asReceiving);
    _bankDepositController.text = _formatValue(entry.bankDeposit);
    _cashExpenseController.text = _formatValue(entry.cashExpense);
    _reasonController.text = entry.reasonOfExpense;
  }

  String _formatValue(double value) {
    if (value == 0) return '';
    final formatter = NumberFormat.currency(
      locale: 'en_IN',
      symbol: '₹',
      decimalDigits: 0,
    );
    return formatter.format(value);
  }

  double _parseValue(String text) {
    if (text.isEmpty) return 0;
    final cleaned = text.replaceAll(RegExp(r'[^0-9]'), '');
    if (cleaned.isEmpty) return 0;
    return double.tryParse(cleaned) ?? 0;
  }

  ExpenseEntry _buildEntryFromForm() {
    return ExpenseEntry(
      date: _selectedDate,
      onlineReceiving: _parseValue(_onlineReceivingController.text),
      offlineReceiving: _parseValue(_offlineReceivingController.text),
      uoloReceiving: _parseValue(_uoloReceivingController.text),
      asReceiving: _parseValue(_asReceivingController.text),
      bankDeposit: _parseValue(_bankDepositController.text),
      cashExpense: _parseValue(_cashExpenseController.text),
      totalReceiving: _calculatedTotal,
      cashInhand: _calculatedCashInHand,
      reasonOfExpense: _reasonController.text,
      existsInSheet: _currentEntry?.existsInSheet ?? false,
      rowNumber: _currentEntry?.rowNumber,
    );
  }

  Future<void> _saveEntry() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isSaving = true;
      _errorMessage = null;
    });

    try {
      final entry = _buildEntryFromForm();
      final savedEntry = await _repository.saveEntry(entry);

      setState(() {
        _currentEntry = savedEntry;
        _isSaving = false;
        _isEditMode = false;
      });

      if (mounted) {
        await _showSuccessSheet();
      }

      // Reload to get calculated values
      await _loadEntry();
    } on DuplicateEntryException catch (e) {
      setState(() {
        _errorMessage = e.message;
        _isSaving = false;
      });
    } catch (e) {
      setState(() {
        _errorMessage =
            _t('Failed to save: ', 'सेव करने में विफल: ') + e.toString();
        _isSaving = false;
      });
    }
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: _minDate,
      lastDate: _maxDate,
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: ColorScheme.light(primary: AppTheme.primaryColor),
          ),
          child: child!,
        );
      },
    );

    if (picked != null && picked != _selectedDate) {
      setState(() {
        _selectedDate = picked;
      });
      await _loadEntry();
    }
  }

  double get _calculatedTotal {
    return _parseValue(_offlineReceivingController.text) +
        _parseValue(_uoloReceivingController.text) +
        _parseValue(_asReceivingController.text);
  }

  double get _calculatedCashInHand {
    return _calculatedTotal -
        _parseValue(_onlineReceivingController.text) -
        _parseValue(_bankDepositController.text) -
        _parseValue(_cashExpenseController.text);
  }

  @override
  void dispose() {
    _onlineReceivingController.dispose();
    _offlineReceivingController.dispose();
    _uoloReceivingController.dispose();
    _asReceivingController.dispose();
    _bankDepositController.dispose();
    _cashExpenseController.dispose();
    _reasonController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_t('Expense Tracker', 'ख़र्च ट्रैकर')),
        actions: [
          IconButton(
            icon: Icon(_isEnglish ? Icons.language : Icons.g_translate),
            onPressed: () => setState(() => _isEnglish = !_isEnglish),
            tooltip: _t('Switch Language', 'भाषा बदलें'),
          ),
          if (_currentEntry?.existsInSheet == true && !_isEditMode)
            IconButton(
              icon: const Icon(Icons.edit),
              onPressed: () => setState(() {
                _isEditMode = true;
                _currentStep = 1;
              }),
              tooltip: _t('Edit Entry', 'एंट्री एडिट करें'),
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Column(
              children: [
                if (_errorMessage != null)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16.0,
                      vertical: 8.0,
                    ),
                    child: _buildErrorCard(),
                  ),
                Expanded(
                  child: Form(
                    key: _formKey,
                    child: Stepper(
                      physics: const ClampingScrollPhysics(),
                      type: StepperType.vertical,
                      currentStep: _currentStep,
                      onStepCancel: () {
                        if (_currentStep > 0) {
                          setState(() => _currentStep -= 1);
                        }
                      },
                      onStepContinue: () {
                        if (_currentStep == 1) {
                          final uoloRaw = _uoloReceivingController.text
                              .replaceAll(RegExp(r'[^0-9]'), '');
                          if (uoloRaw.isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  _t(
                                    'Uolo fees is required',
                                    'Uolo की फीस आवश्यक है',
                                  ),
                                ),
                                backgroundColor: AppTheme.errorColor,
                              ),
                            );
                            return;
                          }
                        }
                        if (_currentStep == 5) {
                          final cashExpense = _parseValue(
                            _cashExpenseController.text,
                          );
                          if (cashExpense > 0 &&
                              _reasonController.text.trim().isEmpty) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(
                                  _t(
                                    'Reason of expense is required if Cash Expense is filled',
                                    'नकद खर्च भरने पर खर्च का कारण बताना आवश्यक है',
                                  ),
                                ),
                                backgroundColor: AppTheme.errorColor,
                              ),
                            );
                            return;
                          }
                        }
                        if (_currentStep < 6) {
                          setState(() => _currentStep += 1);
                        } else {
                          // Submit at final step
                          if (_isEditMode ||
                              _currentEntry?.existsInSheet == false) {
                            _saveEntry();
                          }
                        }
                      },
                      onStepTapped: (step) {
                        setState(() => _currentStep = step);
                      },
                      controlsBuilder: (context, details) {
                        final isLastStep = _currentStep == 6;
                        final isReadOnly =
                            _currentEntry?.existsInSheet == true &&
                            !_isEditMode;

                        if (isReadOnly && isLastStep) {
                          return const SizedBox.shrink(); // Hide controls if reviewing
                        }

                        return Padding(
                          padding: const EdgeInsets.only(top: 16.0),
                          child: Row(
                            children: [
                              ElevatedButton(
                                onPressed: _isSaving
                                    ? null
                                    : details.onStepContinue,
                                child: _isSaving && isLastStep
                                    ? const SizedBox(
                                        height: 20,
                                        width: 20,
                                        child: CircularProgressIndicator(
                                          strokeWidth: 2,
                                          color: Colors.white,
                                        ),
                                      )
                                    : Text(
                                        isLastStep
                                            ? (_currentEntry?.existsInSheet ==
                                                      true
                                                  ? _t(
                                                      'Save Changes',
                                                      'बदलाव सेव करें',
                                                    )
                                                  : _t(
                                                      'Submit Fees',
                                                      'फीस जमा करें',
                                                    ))
                                            : _t('Continue', 'आगे बढ़ें'),
                                      ),
                              ),
                              if (_currentStep > 0) ...[
                                const SizedBox(width: 8),
                                TextButton(
                                  onPressed: _isSaving
                                      ? null
                                      : details.onStepCancel,
                                  child: Text(_t('Back', 'पीछे जाएँ')),
                                ),
                              ],
                            ],
                          ),
                        );
                      },
                      steps: [
                        // Step 0: Date Selection
                        Step(
                          isActive: _currentStep >= 0,
                          title: Text(
                            _t('Select Date', 'तारीख चुनें'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          content: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              _buildDateCard(),
                              const SizedBox(height: 12),
                              _buildStatusChip(),
                            ],
                          ),
                        ),
                        // Step 1: Uolo Fees
                        Step(
                          isActive: _currentStep >= 1,
                          title: Text(
                            _t('Uolo Fees', 'Uolo की फीस'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'How much fees was taken in Uolo?',
                              'Uolo में कितनी फीस ली गई?',
                            ),
                          ),
                          content: NumericInputField(
                            label: _t('Fees taken in Uolo', 'Uolo की फीस'),
                            controller: _uoloReceivingController,
                            icon: Icons.school,
                            iconColor: AppTheme.incomeColor,
                            readOnly:
                                !_isEditMode &&
                                _currentEntry?.existsInSheet == true,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        // Step 2: Online Fees
                        Step(
                          isActive: _currentStep >= 2,
                          title: Text(
                            _t('Online Fees', 'ऑनलाइन फीस'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'Fees paid via Paytm/Online?',
                              'Paytm/ऑनलाइन के माध्यम से कितनी फीस दी गई?',
                            ),
                          ),
                          content: NumericInputField(
                            label: _t(
                              'Online Receiving (PAYTM)',
                              'ऑनलाइन प्राप्त (PAYTM)',
                            ),
                            controller: _onlineReceivingController,
                            icon: Icons.language,
                            iconColor: AppTheme.incomeColor,
                            readOnly:
                                !_isEditMode &&
                                _currentEntry?.existsInSheet == true,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        // Step 3: Offline Fees
                        Step(
                          isActive: _currentStep >= 3,
                          title: Text(
                            _t('Offline Fees', 'ऑफ़लाइन फीस'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'Fees not taken on Uolo',
                              'फीस जो Uolo पर नहीं ली गई',
                            ),
                          ),
                          content: NumericInputField(
                            label: _t('Offline Receiving', 'ऑफ़लाइन प्राप्त'),
                            controller: _offlineReceivingController,
                            icon: Icons.store,
                            iconColor: AppTheme.incomeColor,
                            readOnly:
                                !_isEditMode &&
                                _currentEntry?.existsInSheet == true,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        // Step 4: Principal / Director Fees
                        Step(
                          isActive: _currentStep >= 4,
                          title: Text(
                            _t(
                              'Fees taken by Principal/Director',
                              'प्रिंसिपल/डायरेक्टर द्वारा ली गई फीस',
                            ),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'Taken directly by Principal/Director',
                              'प्रिंसिपल/डायरेक्टर द्वारा सीधे ली गई फीस',
                            ),
                          ),
                          content: NumericInputField(
                            label: _t(
                              'Principal/Director Receive',
                              'प्रिंसिपल/डायरेक्टर प्राप्त',
                            ),
                            controller: _asReceivingController,
                            icon: Icons.account_balance,
                            iconColor: AppTheme.incomeColor,
                            readOnly:
                                !_isEditMode &&
                                _currentEntry?.existsInSheet == true,
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        // Step 5: Transactions
                        Step(
                          isActive: _currentStep >= 5,
                          title: Text(
                            _t('Transactions', 'लेन-देन'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'Bank deposit and cash expenses',
                              'बैंक में जमा और नकद खर्च',
                            ),
                          ),
                          content: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              NumericInputField(
                                label: _t('Bank Deposit', 'बैंक जमा'),
                                controller: _bankDepositController,
                                icon: Icons.account_balance_wallet,
                                iconColor: AppTheme.neutralColor,
                                readOnly:
                                    !_isEditMode &&
                                    _currentEntry?.existsInSheet == true,
                                onChanged: (_) => setState(() {}),
                              ),
                              const SizedBox(height: 12),
                              NumericInputField(
                                label: _t('Cash Expense', 'नकद खर्च'),
                                controller: _cashExpenseController,
                                icon: Icons.money_off,
                                iconColor: AppTheme.expenseColor,
                                readOnly:
                                    !_isEditMode &&
                                    _currentEntry?.existsInSheet == true,
                                onChanged: (_) => setState(() {}),
                              ),
                              const SizedBox(height: 12),
                              TextFormField(
                                controller: _reasonController,
                                decoration: InputDecoration(
                                  labelText: _t(
                                    'Reason of Expense',
                                    'खर्च का कारण',
                                  ),
                                  border: const OutlineInputBorder(),
                                  prefixIcon: const Icon(Icons.description),
                                ),
                                enabled:
                                    _isEditMode ||
                                    _currentEntry?.existsInSheet == false,
                                maxLines: 2,
                              ),
                            ],
                          ),
                        ),
                        // Step 6: Summary
                        Step(
                          isActive: _currentStep >= 6,
                          title: Text(
                            _t('Summary', 'सारांश'),
                            style: const TextStyle(fontWeight: FontWeight.bold),
                          ),
                          subtitle: Text(
                            _t(
                              'Review calculated values and Submit',
                              'गिने गए मूल्यों की समीक्षा करें और जमा करें',
                            ),
                          ),
                          content: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              Screenshot(
                                controller: _screenshotController,
                                child: Container(
                                  color: Theme.of(
                                    context,
                                  ).scaffoldBackgroundColor,
                                  child: _buildDetailedSummaryCard(),
                                ),
                              ),
                              if (_currentEntry?.existsInSheet == true) ...[
                                const SizedBox(height: 16),
                                ElevatedButton.icon(
                                  icon: const Icon(Icons.share),
                                  label: Text(
                                    _t(
                                      'Share on WhatsApp',
                                      'WhatsApp पर शेयर करें',
                                    ),
                                  ),
                                  onPressed: _shareSummary,
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: const Color(
                                      0xFF25D366,
                                    ), // WhatsApp color
                                    foregroundColor: Colors.white,
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
    );
  }

  Widget _buildDateCard() {
    return Card(
      child: InkWell(
        onTap: _selectDate,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.primaryColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(Icons.calendar_today, color: AppTheme.primaryColor),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      _t('Selected Date', 'चुनी गई तारीख'),
                      style: TextStyle(
                        fontSize: 12,
                        color: AppTheme.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      DateFormat('EEEE, MMMM d, yyyy').format(_selectedDate),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: AppTheme.textSecondary),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildErrorCard() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.errorColor.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: AppTheme.errorColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline, color: AppTheme.errorColor, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              _errorMessage!,
              style: TextStyle(color: AppTheme.errorColor, fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusChip() {
    final exists = _currentEntry?.existsInSheet ?? false;
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: exists
                ? AppTheme.successColor.withValues(alpha: 0.1)
                : AppTheme.warningColor.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                exists ? Icons.check_circle : Icons.add_circle_outline,
                size: 16,
                color: exists ? AppTheme.successColor : AppTheme.warningColor,
              ),
              const SizedBox(width: 6),
              Text(
                exists
                    ? (_isEditMode
                          ? _t('Editing Entry', 'एंट्री एडिट कर रहे हैं')
                          : _t('Entry Exists', 'एंट्री मौजूद है'))
                    : _t('New Entry', 'नयी एंट्री'),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: exists ? AppTheme.successColor : AppTheme.warningColor,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildDetailedSummaryCard() {
    final numberFormat = NumberFormat.currency(symbol: '₹', decimalDigits: 0);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: AppTheme.borderColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Icon(Icons.receipt_long, color: AppTheme.primaryColor),
                Text(
                  DateFormat('dd-MMM-yyyy').format(_selectedDate),
                  style: const TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 16,
                  ),
                ),
              ],
            ),
            const Divider(height: 24),
            _buildSummaryRow(
              _t('Uolo Fees', 'Uolo की फीस'),
              _uoloReceivingController.text,
            ),
            _buildSummaryRow(
              _t('Online Fees (via Paytm)', 'ऑनलाइन फीस (Paytm)'),
              _onlineReceivingController.text,
            ),
            _buildSummaryRow(
              _t('Offline Fees (Not taken on Uolo)', 'ऑफ़लाइन फीस'),
              _offlineReceivingController.text,
            ),
            _buildSummaryRow(
              _t('Principal/Director Receive', 'प्रिंसिपल/डायरेक्टर प्राप्त'),
              _asReceivingController.text,
            ),
            const Divider(height: 24),
            _buildSummaryRow(
              _t('Bank Deposit', 'बैंक जमा'),
              _bankDepositController.text,
            ),
            _buildSummaryRow(
              _t('Cash Expense', 'नकद खर्च'),
              _cashExpenseController.text,
            ),
            if (_reasonController.text.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 8.0),
                child: Text(
                  '${_t('Reason', 'कारण')}: ${_reasonController.text}',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              ),
            const Divider(height: 24),
            CalculatedField(
              label: _t('Total Receiving Today', 'कुल प्राप्त'),
              value: numberFormat.format(_calculatedTotal),
              icon: Icons.trending_up,
              valueColor: AppTheme.incomeColor,
            ),
            const SizedBox(height: 12),
            CalculatedField(
              label: _t('Cash In Hand Today', 'नकद हाथ में'),
              value: numberFormat.format(_calculatedCashInHand),
              icon: Icons.wallet,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSummaryRow(String label, String value) {
    if (value.isEmpty || value == '₹0') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(label, style: TextStyle(color: AppTheme.textSecondary)),
          ),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Future<void> _showSuccessSheet() async {
    // First capture the screenshot while the widget is still rendered
    final ScreenshotController sheetScreenshotController = ScreenshotController();

    await showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _buildSuccessSheetBody(sheetScreenshotController),
    );
  }

  Widget _buildSuccessSheetBody(ScreenshotController sheetController) {
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.9,
      maxChildSize: 0.96,
      minChildSize: 0.5,
      builder: (context, scrollController) => Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12, bottom: 8),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.grey[300],
              borderRadius: BorderRadius.circular(8),
            ),
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: scrollController,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  // Success icon
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: AppTheme.successColor,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.check, color: Colors.white, size: 40),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    _t('Fees Submitted!', 'फीस जमा हो गई!'),
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    _t('Your daily record has been saved.', 'आपका दैनिक रिकॉर्ड सहेज लिया गया है।'),
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                  const SizedBox(height: 20),
                  // Captured summary card
                  Screenshot(
                    controller: sheetController,
                    child: Container(
                      color: Colors.white,
                      padding: const EdgeInsets.all(4),
                      child: _buildDetailedSummaryCard(),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Share button
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.share),
                      label: Text(_t('Share on WhatsApp', 'WhatsApp पर शेयर करें')),
                      onPressed: () async {
                        try {
                          final directory = (await getApplicationDocumentsDirectory()).path;
                          final fileName = 'Expense_${DateFormat('dd-MMM-yyyy').format(_selectedDate)}.png';
                          final imagePath = await sheetController.captureAndSave(
                            directory,
                            fileName: fileName,
                          );
                          if (imagePath != null) {
                            await SharePlus.instance.share(
                              ShareParams(
                                files: [XFile(imagePath)],
                                text: _t('Expense Summary: ', 'खर्च सारांश: ') +
                                    DateFormat('dd-MMM-yyyy').format(_selectedDate),
                              ),
                            );
                          }
                        } catch (e) {
                          // ignore share errors
                        }
                      },
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        backgroundColor: const Color(0xFF25D366),
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Done button
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context).pop(),
                      style: OutlinedButton.styleFrom(
                        padding: const EdgeInsets.symmetric(vertical: 14),
                      ),
                      child: Text(_t('Done', 'ठीक है')),
                    ),
                  ),
                  const SizedBox(height: 24),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _shareSummary() async {
    try {
      final directory = (await getApplicationDocumentsDirectory()).path;
      final fileName =
          'Expense_Summary_${DateFormat('dd-MMM-yyyy').format(_selectedDate)}.png';
      final imagePath = await _screenshotController.captureAndSave(
        directory,
        fileName: fileName,
      );

      if (imagePath != null) {
        final xFile = XFile(imagePath);
        await SharePlus.instance.share(
          ShareParams(
            files: [xFile],
            text:
                _t('Expense Summary for ', 'खर्च का सारांश: ') +
                DateFormat('dd-MMM-yyyy').format(_selectedDate),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              _t('Failed to capture screenshot', 'स्क्रीनशॉट लेने में विफल'),
            ),
          ),
        );
      }
    }
  }
}
