import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateUserDto } from '../../interfaces/dtos/users.update.dto';
import { UserEntity } from 'src/entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
  ) {}

  
   async getUsers(
    page: number,
    Limit: number,
  ): Promise<Omit<UserEntity, 'password'>[]> {
    const results = await this.userRepository.find({
      skip: (page - 1) * Limit,
      take: Limit,
    });
    const users = results.map((user) => {
      const { password, ...usuariosinpassword } = user;
      return usuariosinpassword;
    });

    return users;
    }
  
  async updateUser(
    id: string,
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
  async getUserById(id: string): Promise<UserEntity> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  // Método para eliminar un usuario
  async deleteUser(id: string) {
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