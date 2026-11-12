import { Prisma } from '@prisma/client';
import { categoryRepository } from '../repositories/category.repository.js';
import { productRepository } from '../repositories/product.repository.js';
import { AppError } from '../utils/AppError.js';
import { generateCode } from '../utils/codes.js';
import type {
  CategoryCreateInput,
  CategoryUpdateInput,
  ProductCreateInput,
  ProductUpdateInput,
} from '../validators/catalog.validators.js';

export interface CategoryDto {
  id: string;
  code: string;
  name: string;
  description?: string;
}

export interface ProductDto {
  barcode: string;
  name: string;
  category_id: string;
  category_name: string;
  selling_price: number;
  unit: string;
  stock_quantity: number;
  min_stock: number;
  cost_price?: number;
  image_url?: string;
}

type ProductWithCategory = Awaited<ReturnType<typeof productRepository.findByBarcode>> & {};

function categoryDto(category: {
  id: string;
  code: string;
  name: string;
  description: string | null;
}): CategoryDto {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    ...(category.description === null ? {} : { description: category.description }),
  };
}

function productDto(product: NonNullable<ProductWithCategory>, includeCostPrice: boolean): ProductDto {
  return {
    barcode: product.barcode,
    name: product.name,
    category_id: product.categoryId,
    category_name: product.category.name,
    selling_price: Number(product.sellingPrice),
    unit: product.unit,
    stock_quantity: product.stockQuantity,
    min_stock: product.minStock,
    ...(includeCostPrice ? { cost_price: Number(product.costPrice) } : {}),
    ...(product.imageUrl === null ? {} : { image_url: product.imageUrl }),
  };
}

export const catalogService = {
  async listCategories(search?: string): Promise<CategoryDto[]> {
    return (await categoryRepository.findAll(search)).map(categoryDto);
  },

  async getCategory(id: string): Promise<CategoryDto> {
    const category = await categoryRepository.findById(id);
    if (!category) throw new AppError(404, 'Không tìm thấy danh mục.', 'CATEGORY_NOT_FOUND');
    return categoryDto(category);
  },

  async createCategory(input: CategoryCreateInput): Promise<CategoryDto> {
    if (await categoryRepository.findByName(input.name)) {
      throw new AppError(409, `Tên danh mục "${input.name}" đã tồn tại.`, 'CATEGORY_NAME_EXISTS');
    }
    let code = input.code;
    if (code) {
      if (await categoryRepository.findByCode(code)) {
        throw new AppError(409, `Mã danh mục "${code}" đã tồn tại.`, 'CATEGORY_CODE_EXISTS');
      }
    } else {
      code = await generateCode('category', async (candidate) =>
        Boolean(await categoryRepository.findByCode(candidate)),
      );
    }

    const category = await categoryRepository.create({
      code,
      name: input.name,
      description: input.description || null,
    });
    return categoryDto(category);
  },

  async updateCategory(id: string, input: CategoryUpdateInput): Promise<CategoryDto> {
    const current = await categoryRepository.findById(id);
    if (!current) throw new AppError(404, 'Không tìm thấy danh mục.', 'CATEGORY_NOT_FOUND');

    if (input.name && (await categoryRepository.findByName(input.name, id))) {
      throw new AppError(409, `Tên danh mục "${input.name}" đã tồn tại.`, 'CATEGORY_NAME_EXISTS');
    }
    if (input.code && (await categoryRepository.findByCode(input.code, id))) {
      throw new AppError(409, `Mã danh mục "${input.code}" đã tồn tại.`, 'CATEGORY_CODE_EXISTS');
    }

    const category = await categoryRepository.update(id, {
      ...(input.code === undefined ? {} : { code: input.code }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description || null }),
    });
    return categoryDto(category);
  },

  async deleteCategory(id: string): Promise<void> {
    if (!(await categoryRepository.findById(id))) {
      throw new AppError(404, 'Không tìm thấy danh mục.', 'CATEGORY_NOT_FOUND');
    }
    const productCount = await categoryRepository.countProducts(id);
    if (productCount > 0) {
      throw new AppError(
        409,
        `Không thể xóa danh mục vì vẫn còn ${productCount} sản phẩm thuộc danh mục này.`,
        'CATEGORY_HAS_PRODUCTS',
      );
    }
    await categoryRepository.delete(id);
  },

  async listProducts(options: { search?: string; categoryId?: string; includeCostPrice: boolean }) {
    const products = await productRepository.findAll(options);
    return products.map((product) => productDto(product, options.includeCostPrice));
  },

  async getProduct(barcode: string, includeCostPrice: boolean): Promise<ProductDto> {
    const product = await productRepository.findByBarcode(barcode);
    if (!product) throw new AppError(404, 'Không tìm thấy sản phẩm.', 'PRODUCT_NOT_FOUND');
    return productDto(product, includeCostPrice);
  },

  async createProduct(input: ProductCreateInput, includeCostPrice: boolean): Promise<ProductDto> {
    if (await productRepository.findByBarcode(input.barcode, true)) {
      throw new AppError(409, `Mã vạch ${input.barcode} đã tồn tại trong hệ thống.`, 'PRODUCT_BARCODE_EXISTS');
    }
    if (await productRepository.findByName(input.name)) {
      throw new AppError(409, `Tên sản phẩm "${input.name}" đã tồn tại trong hệ thống.`, 'PRODUCT_NAME_EXISTS');
    }
    const category = await categoryRepository.findById(input.category_id);
    if (!category) throw new AppError(400, 'Danh mục sản phẩm không hợp lệ.', 'INVALID_CATEGORY');

    const product = await productRepository.create({
      barcode: input.barcode,
      name: input.name,
      category: { connect: { id: category.id } },
      costPrice: input.cost_price ?? 0,
      sellingPrice: input.selling_price,
      unit: input.unit,
      stockQuantity: 0,
      minStock: input.min_stock,
      imageUrl: input.image_url || null,
    });
    return productDto(product, includeCostPrice);
  },

  async updateProduct(
    barcode: string,
    input: ProductUpdateInput,
    includeCostPrice: boolean,
  ): Promise<ProductDto> {
    const current = await productRepository.findByBarcode(barcode);
    if (!current) throw new AppError(404, 'Không tìm thấy sản phẩm.', 'PRODUCT_NOT_FOUND');

    if (input.name && (await productRepository.findByName(input.name, barcode))) {
      throw new AppError(409, `Tên sản phẩm "${input.name}" đã trùng với sản phẩm khác.`, 'PRODUCT_NAME_EXISTS');
    }
    if (input.category_id) {
      const category = await categoryRepository.findById(input.category_id);
      if (!category) throw new AppError(400, 'Danh mục sản phẩm không hợp lệ.', 'INVALID_CATEGORY');
    }

    const data: Prisma.ProductUpdateInput = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.category_id === undefined ? {} : { category: { connect: { id: input.category_id } } }),
      ...(input.cost_price === undefined ? {} : { costPrice: input.cost_price }),
      ...(input.selling_price === undefined ? {} : { sellingPrice: input.selling_price }),
      ...(input.unit === undefined ? {} : { unit: input.unit }),
      ...(input.min_stock === undefined ? {} : { minStock: input.min_stock }),
      ...(input.image_url === undefined ? {} : { imageUrl: input.image_url || null }),
    };
    const product = await productRepository.update(current.id, data);
    return productDto(product, includeCostPrice);
  },

  async deleteProduct(barcode: string): Promise<void> {
    const product = await productRepository.findByBarcode(barcode);
    if (!product) throw new AppError(404, 'Không tìm thấy sản phẩm.', 'PRODUCT_NOT_FOUND');
    if (await productRepository.hasInvoiceDetails(product.id)) {
      throw new AppError(
        409,
        'Không thể xóa sản phẩm này vì đã có dữ liệu trong lịch sử hóa đơn bán hàng.',
        'PRODUCT_HAS_INVOICES',
      );
    }
    await productRepository.discontinue(product.id);
  },
};
