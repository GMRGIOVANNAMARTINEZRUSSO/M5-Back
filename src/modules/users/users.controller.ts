import { Controller, Get, NotFoundException, Query, Param, Body, Delete,Put} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from '../../interfaces/dtos/users.update.dto';
import { UserEntity } from '../../entities/user.entity';
import { PaginatedUsers } from '../../interfaces/paginatedUser';
@Controller('users')
export class UserController {
  constructor(private readonly userService: UsersService) {}

  @Get()
  async getUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ):Promise<PaginatedUsers | Omit<UserEntity, 'password'>[]> {
    try {   
      
      if( page===undefined || limit===undefined) {
        const results = await this.userService.getUsers();
        return results
      }
      return await this.userService.getUsers(page, limit);
    } catch (error) {
      throw new NotFoundException(error);
    }
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: number,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserEntity> {
    return this.userService.updateUser(id, updateUserDto);
  }

  // Endpoint para obtener un usuario por su ID
  @Get(':id')
  async getUserById(@Param('id') id: number): Promise<UserEntity> {
    return this.userService.getUserById(id);
  }

  //Endpoint para actualizar el estado del usuario
  @Put('status/:userId/:statusId')
  async updateUserStatus(
    @Param('userId') userId: number, 
    @Param('statusId') statusId: number, 
  ) {
    return this.userService.updateUserStatus(userId, statusId);
  }

  // Endpoint para eliminar un usuario
  @Delete(':id')
  async deleteUser(@Param('id') id: number) {
    return this.userService.deleteUser(id);
  }

  // Endpoint para verificar el email de un usuario
  @Put('verify-email/:email')
  async verifyEmail(@Param('email') email: string) {
    return this.userService.verifyEmail(email);
  }
}
