import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserDto } from '../../interfaces/dtos/users.update.dto';
import { UserEntity } from '../../entities/user.entity';
import {PaginatedUsers} from '../../interfaces/paginatedUser';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  
   async getUsers(
    page?: number,
    Limit?: number,
  ): Promise<PaginatedUsers | Omit<UserEntity, 'password'>[]> {

    if(page === undefined || Limit === undefined) {
      const results = await this.userRepository.find()
      const users = results.map((user) => {
        const { password, ...usuariosinpassword } = user;
        return usuariosinpassword;
      });
      return users;
    }

    const results = await this.userRepository.find({
      skip: (page - 1) * Limit,
      take: Limit,
    });
    const users = results.map((user) => {
      const { password, ...usuariosinpassword } = user;
      return usuariosinpassword;
    });

    const totalPages = Math.ceil((await this.userRepository.count()) / Limit);
    
    const data = { users, totalPages };
    return data;
    }
  
  async updateUser(
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const updatedUser = Object.assign(user, updateUserDto);
    updatedUser.modifiedAt = new Date(); // Actualizar la fecha de modificación

    return this.userRepository.save(updatedUser);
  }

  // Método para obtener un usuario por su ID
  async getUserById(id: number): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  
  // Método para actualizar el estado de un usuario
  async updateUserStatus(userId: number, statusId: number) {
    const result = await this.userRepository.update(userId, {statusId: statusId});

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return {message:"User status updated"};
  }


  // Método para eliminar un usuario
  async deleteUser(id: number) {
    const result = await this.userRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return result;
  }

  // Método para verificar un email
  async verifyEmail(email: string) {
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user) {
      throw new NotFoundException(`User with email ${email} not found`);
    }

    user.verifiedEmail = true;
    return await this.userRepository.save(user);

  }
}
