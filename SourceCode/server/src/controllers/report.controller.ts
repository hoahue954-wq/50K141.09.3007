import type { RequestHandler } from 'express';
import { reportService } from '../services/report.service.js';
import { dailyReportSchema, monthlyReportSchema, reportRangeSchema } from '../validators/report.validators.js';

export const getRevenueReport: RequestHandler = async (req, res) => {
  res.json(await reportService.revenue(reportRangeSchema.parse(req.query)));
};

export const getProfitReport: RequestHandler = async (req, res) => {
  res.json(await reportService.profit(reportRangeSchema.parse(req.query)));
};

export const getDailyReport: RequestHandler = async (req, res) => {
  const { date } = dailyReportSchema.parse(req.query);
  res.json(await reportService.daily(date));
};

export const getMonthlyReport: RequestHandler = async (req, res) => {
  const { year, month } = monthlyReportSchema.parse(req.query);
  res.json(await reportService.monthly(year, month));
};

function getProfile(res: Parameters<RequestHandler>[1]) {
  return res.locals.authProfile!;
}

export const importExpenses: RequestHandler = async (req, res) => {
  if (!req.file) {
    res.status(400).json({
      statusCode: 400,
      code: 'MISSING_FILE',
      message: 'Vui lòng chọn tệp Excel để nhập chi phí.',
    });
    return;
  }
  const month = req.body?.month || req.query?.month;
  const result = await reportService.importExpensesExcel(
    req.file.buffer,
    req.file.originalname,
    typeof month === 'string' ? month : undefined,
    getProfile(res).id
  );
  res.status(200).json(result);
};
