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
